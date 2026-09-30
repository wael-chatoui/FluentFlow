// Public Google Docs / Drive links → document text. Server only.
//
// The link is parsed by utils/import/googleLinks.js (same parser as the browser) and
// the download URL is rebuilt from the document id: a pasted URL is never fetched as
// is. Redirects are followed by hand (5 at most) and only to Google download hosts,
// so the server can only ever read from Google.
import { ImportError } from '@/utils/import/errors'
import { LINK_MESSAGES, parseGoogleLink } from '@/utils/import/googleLinks'
import { IMPORT_LIMITS, megabytes } from '@/utils/import/limits'
import { extractPdfText, isPdf } from '@/utils/import/pdf'
import { prepareImportText, sanitizeSourceName } from '@/utils/import/text'

const FETCH_TIMEOUT_MS = 20_000
const MAX_REDIRECTS = 5

const DOC_LOW_TEXT_WARNING =
  'Très peu de texte trouvé dans ce document : vérifie que c’est le bon, ou colle le texte à la main.'

export const MESSAGES = {
  notPublic:
    'Impossible de lire ce document : il doit être partagé en « Tous les utilisateurs disposant du lien » (Partager → Accès général). Les fichiers trop volumineux ne peuvent pas non plus être téléchargés directement.',
  notFound: 'Document introuvable : vérifie le lien et le partage « Tous les utilisateurs disposant du lien ».',
  tooLarge: `Fichier trop volumineux (${megabytes(IMPORT_LIMITS.maxDownloadBytes)} max).`,
  timeout: 'Google met trop de temps à répondre. Réessaie dans un instant.',
  network: 'Impossible de joindre Google. Réessaie dans un instant.',
  upstream: "Google n'a pas pu fournir le document. Réessaie dans un instant.",
  redirect:
    "Google renvoie ce document vers une adresse inattendue : télécharge-le en PDF puis ajoute le fichier à la place du lien.",
  fileType:
    'Ce type de fichier Drive n’est pas pris en charge (seulement PDF, .txt, .md ou Google Docs). Pour un fichier Word, ouvre-le dans Google Docs (Fichier → Enregistrer au format Google Docs) ou exporte-le en PDF.',
}

const ALLOWED_HOSTS = new Set(['docs.google.com', 'drive.google.com', 'drive.usercontent.google.com'])

/** Hosts a download may be redirected to (Google Docs / Drive and their file servers). */
export function isAllowedHost(hostname) {
  const host = String(hostname || '').toLowerCase()
  return ALLOWED_HOSTS.has(host) || host.endsWith('.googleusercontent.com')
}

/**
 * Parses a Google Docs / Drive link for the server.
 * @returns {{ kind: 'doc'|'drive', id: string, resourceKey: string|null }}
 * @throws {ImportError} 400 with the French message of the shared parser
 */
function parseLink(input) {
  const link = parseGoogleLink(input)
  if (link.error) throw new ImportError(link.error)
  return link
}

/** The URL the server downloads, built only from the parsed id. */
export function buildFetchUrl({ kind, id, resourceKey }) {
  const key = resourceKey ? `&resourcekey=${encodeURIComponent(resourceKey)}` : ''
  const safeId = encodeURIComponent(id)
  if (kind === 'doc') return `https://docs.google.com/document/d/${safeId}/export?format=txt${key}`
  if (kind === 'drive') return `https://drive.google.com/uc?export=download&id=${safeId}${key}`
  throw new ImportError(LINK_MESSAGES.invalid)
}

/**
 * File name from a Content-Disposition header: RFC 5987 `filename*` first,
 * then `filename` (UTF-8 bytes sent raw are repaired). '' when absent.
 */
export function filenameFromDisposition(header) {
  if (typeof header !== 'string' || !header) return ''

  const extended = /filename\*\s*=\s*([^;]+)/i.exec(header)
  if (extended) {
    const value = extended[1].trim().replace(/^"(.*)"$/, '$1')
    const m = /^([A-Za-z0-9!#$&+.^_`{}~-]*)'[^']*'(.*)$/.exec(value)
    const encoded = m ? m[2] : value
    const charset = m ? m[1].toLowerCase() : 'utf-8'
    try {
      if (charset === 'iso-8859-1' || charset === 'latin1') {
        return unescape(encoded) // latin1 percent-encoding
      }
      return decodeURIComponent(encoded)
    } catch {
      // fall back to the plain filename
    }
  }

  const plain = /filename\s*=\s*("((?:[^"\\]|\\.)*)"|[^;]+)/i.exec(header)
  if (!plain) return ''
  const value = plain[2] !== undefined ? plain[2].replace(/\\(.)/g, '$1') : plain[1].trim()
  return repairUtf8(value)
}

// Header values are decoded as latin1: UTF-8 names come out as "LeÃ§on"
function repairUtf8(value) {
  const codes = [...value].map((c) => c.codePointAt(0))
  if (!codes.some((c) => c >= 0x80) || codes.some((c) => c > 0xff)) return value
  const repaired = Buffer.from(value, 'latin1').toString('utf8')
  return repaired.includes(String.fromCharCode(0xfffd)) ? value : repaired
}

/** Releases a response we will not read (frees the socket right away). */
function discard(response) {
  try {
    response?.body?.cancel().catch(() => {})
  } catch {
    // body already consumed or locked
  }
}

/**
 * Reads a fetch Response body with a byte cap.
 * @returns {Promise<Buffer>}
 * @throws {ImportError} 400 tooLarge when the cap is exceeded
 */
export async function readCapped(response, maxBytes, controller) {
  const declared = Number(response.headers.get('content-length'))
  if (declared > maxBytes) {
    discard(response)
    controller?.abort()
    throw new ImportError(MESSAGES.tooLarge)
  }
  if (!response.body) return Buffer.alloc(0)

  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    size += value.byteLength
    if (size > maxBytes) {
      await reader.cancel().catch(() => {})
      controller?.abort()
      throw new ImportError(MESSAGES.tooLarge)
    }
    chunks.push(Buffer.from(value))
  }
  return Buffer.concat(chunks, size)
}

function networkError(signal, cause) {
  return new ImportError(signal.aborted ? MESSAGES.timeout : MESSAGES.network, 502, cause)
}

/**
 * fetch() that follows at most MAX_REDIRECTS redirects, each to an https Google
 * host. Google sends private documents to its sign-in page: reported as "not public".
 */
async function fetchFromGoogle(url, { fetchImpl, signal }) {
  let current = url
  for (let hop = 0; ; hop += 1) {
    let response
    try {
      response = await fetchImpl(current, {
        redirect: 'manual',
        signal,
        headers: { Accept: 'text/plain, application/pdf, */*' },
      })
    } catch (err) {
      throw networkError(signal, err)
    }
    if (response.status < 300 || response.status >= 400 || response.status === 304) return response

    const location = response.headers.get('location')
    discard(response)
    if (!location || hop >= MAX_REDIRECTS) throw new ImportError(MESSAGES.upstream, 502)
    let next
    try {
      next = new URL(location, current)
    } catch {
      throw new ImportError(MESSAGES.upstream, 502)
    }
    if (next.hostname === 'accounts.google.com') throw new ImportError(MESSAGES.notPublic)
    if (next.protocol !== 'https:' || next.username || next.password || next.port || !isAllowedHost(next.hostname)) {
      throw new ImportError(MESSAGES.redirect)
    }
    current = next.toString()
  }
}

function statusError(status) {
  if (status === 401 || status === 403) return new ImportError(MESSAGES.notPublic)
  if (status === 404) return new ImportError(MESSAGES.notFound)
  if (status === 413) return new ImportError(MESSAGES.tooLarge)
  return new ImportError(MESSAGES.upstream, 502)
}

function mediaType(contentType) {
  return String(contentType || '').split(';')[0].trim().toLowerCase()
}

/** Downloads one file: { buffer, type, disposition }. */
async function download(url, ctx) {
  const response = await fetchFromGoogle(url, ctx)
  if (!response.ok) {
    discard(response)
    throw statusError(response.status)
  }
  let buffer
  try {
    buffer = await readCapped(response, ctx.maxBytes, ctx.controller)
  } catch (err) {
    if (err instanceof ImportError) throw err
    throw networkError(ctx.signal, err)
  }
  return {
    buffer,
    type: mediaType(response.headers.get('content-type')),
    disposition: response.headers.get('content-disposition'),
  }
}

const isHtml = (type) => type === 'text/html' || type === 'application/xhtml+xml'
const isText = (type) => type === 'text/plain' || type === 'text/markdown'
// Drive may serve .txt / .md files as a generic binary type
const isTextFile = (file) =>
  isText(file.type) ||
  ((file.type === 'application/octet-stream' || file.type === '') &&
    /\.(txt|md|markdown)$/i.test(filenameFromDisposition(file.disposition)))

function decodeText(buffer) {
  const text = new TextDecoder('utf-8').decode(buffer)
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

async function pdfResult(file, fallbackName) {
  const pdf = await extractPdfText(file.buffer)
  const name = sanitizeSourceName(filenameFromDisposition(file.disposition))
  return { sourceName: name || fallbackName, ...pdf }
}

function textResult(file, fallbackName) {
  const { text, warning } = prepareImportText(decodeText(file.buffer), { lowText: DOC_LOW_TEXT_WARNING })
  // The Docs export adds ".txt" to the document title
  const name = sanitizeSourceName(filenameFromDisposition(file.disposition)).replace(/\.txt$/i, '').trim()
  return { sourceName: name || fallbackName, text, pages: null, warning }
}

async function readGoogleDoc(link, ctx) {
  const file = await download(buildFetchUrl({ ...link, kind: 'doc' }), ctx)
  if (isPdf(file.buffer) || file.type === 'application/pdf') return pdfResult(file, 'Google Doc')
  // Sign-in, "no access" or "too large" page
  if (isHtml(file.type)) throw new ImportError(MESSAGES.notPublic)
  if (isText(file.type) || file.type === '') return textResult(file, 'Google Doc')
  throw new ImportError(LINK_MESSAGES.unsupported)
}

async function readDriveFile(link, ctx) {
  let file
  try {
    file = await download(buildFetchUrl(link), ctx)
  } catch (err) {
    if (err instanceof ImportError && (err.message === MESSAGES.notPublic || err.message === MESSAGES.notFound)) {
      return readAsGoogleDoc(link, ctx, err)
    }
    throw err
  }
  if (isPdf(file.buffer) || file.type === 'application/pdf') return pdfResult(file, 'Fichier Drive')
  if (isTextFile(file)) return textResult(file, 'Fichier Drive')
  if (isHtml(file.type)) return readAsGoogleDoc(link, ctx, new ImportError(MESSAGES.notPublic))
  throw new ImportError(MESSAGES.fileType)
}

// Old Drive links (open?id=…) also point to native Google Docs, which the Drive
// download URL does not serve: try the Docs export once before giving up.
async function readAsGoogleDoc(link, ctx, original) {
  try {
    return await readGoogleDoc(link, ctx)
  } catch (err) {
    if (err instanceof ImportError && (err.message === MESSAGES.timeout || err.message === MESSAGES.tooLarge)) throw err
    throw original
  }
}

/**
 * Downloads a public Google Doc (plain-text export) or Drive file (PDF or text) and
 * extracts its text.
 * @param {string} input  link pasted by the teacher
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number, maxBytes?: number }} [deps]
 * @returns {Promise<{ sourceName: string, text: string, pages: number|null, warning: string|null }>}
 * @throws {ImportError}
 */
export async function resolveGoogleLink(
  input,
  { fetchImpl = fetch, timeoutMs = FETCH_TIMEOUT_MS, maxBytes = IMPORT_LIMITS.maxDownloadBytes } = {}
) {
  const link = parseLink(input)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const ctx = { fetchImpl, signal: controller.signal, controller, maxBytes }
  try {
    return link.kind === 'doc' ? await readGoogleDoc(link, ctx) : await readDriveFile(link, ctx)
  } finally {
    clearTimeout(timer)
  }
}
