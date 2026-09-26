// Public Google Docs / Drive links → document text.
//
// Only docs.google.com/document/d/<id> and drive.google.com/file/d/<id> (or
// open?id= / uc?id=) are accepted. The fetch URL is always rebuilt from the id,
// so a user-supplied URL is never fetched as is (no SSRF).
import { ImportError } from './errors.js'
import { extractPdfText, isPdf } from './pdf.js'
import { cleanImportedText, lowTextWarning, sanitizeSourceName } from './text.js'

export const FETCH_TIMEOUT_MS = 20_000
export const MAX_DOWNLOAD_BYTES = 15 * 1024 * 1024

const DOC_LOW_TEXT_WARNING = 'Très peu de texte trouvé dans ce Google Doc : vérifie que c’est le bon document, ou colle le texte à la main.'

const ID_RE = /^[A-Za-z0-9_-]{10,200}$/

export const MESSAGES = {
  invalid:
    'Lien invalide : colle un lien Google Docs (https://docs.google.com/document/d/…) ou Google Drive (https://drive.google.com/file/d/…).',
  unsupported: 'Seuls les Google Docs et les PDF sont pris en charge.',
  notPublic:
    'Impossible de lire ce document : il doit être partagé en « Tous les utilisateurs disposant du lien » (Partager → Accès général). Les fichiers trop volumineux ne peuvent pas non plus être téléchargés directement.',
  notFound: 'Document introuvable : vérifie le lien et le partage « Tous les utilisateurs disposant du lien ».',
  tooLarge: 'Fichier trop volumineux (15 Mo max).',
  timeout: 'Google met trop de temps à répondre. Réessaie dans un instant.',
  network: 'Impossible de joindre Google. Réessaie dans un instant.',
  upstream: "Google n'a pas pu fournir le document. Réessaie dans un instant.",
}

// Optional "/u/<n>" account segment Google adds to some links
const DOC_PATH_RE = /^\/document(?:\/u\/\d+)?\/d\/([^/]+)(?:\/.*)?$/
const FILE_PATH_RE = /^\/file(?:\/u\/\d+)?\/d\/([^/]+)(?:\/.*)?$/
// Google files that are not Docs (Sheets, Slides, Forms, Drawings…) or Drive folders
const OTHER_DOCS_RE = /^\/(?:spreadsheets|presentation|forms|drawings)(?:\/|$)/
const DRIVE_FOLDER_RE = /^\/drive(?:\/u\/\d+)?\/(?:folders|my-drive|shared-with-me|recent|starred)(?:\/|$)/

function checkedId(id) {
  if (!ID_RE.test(id || '')) throw new ImportError(MESSAGES.invalid)
  return id
}

/**
 * Parses a Google Docs / Drive link strictly.
 * @param {string} input
 * @returns {{ kind: 'doc'|'drive', id: string }}
 * @throws {ImportError} 400 with a French message
 */
export function parseGoogleLink(input) {
  if (typeof input !== 'string') throw new ImportError(MESSAGES.invalid)
  const s = input.trim()
  if (!s || s.length > 2000) throw new ImportError(MESSAGES.invalid)

  let url
  try {
    url = new URL(s)
  } catch {
    throw new ImportError(MESSAGES.invalid)
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) throw new ImportError(MESSAGES.invalid)

  const path = url.pathname
  if (url.hostname === 'docs.google.com') {
    const doc = DOC_PATH_RE.exec(path)
    if (doc) return { kind: 'doc', id: checkedId(doc[1]) }
    if (OTHER_DOCS_RE.test(path)) throw new ImportError(MESSAGES.unsupported)
    throw new ImportError(MESSAGES.invalid)
  }

  if (url.hostname === 'drive.google.com') {
    const file = FILE_PATH_RE.exec(path)
    if (file) return { kind: 'drive', id: checkedId(file[1]) }
    if (path === '/open' || path === '/uc') {
      const id = url.searchParams.get('id')
      if (id) return { kind: 'drive', id: checkedId(id) }
    }
    if (DRIVE_FOLDER_RE.test(path)) throw new ImportError(MESSAGES.unsupported)
    throw new ImportError(MESSAGES.invalid)
  }

  throw new ImportError(MESSAGES.invalid)
}

/** The URL the server downloads, built only from the parsed id. */
export function buildFetchUrl({ kind, id }) {
  checkedId(id)
  const safeId = encodeURIComponent(id)
  if (kind === 'doc') return `https://docs.google.com/document/d/${safeId}/export?format=txt`
  if (kind === 'drive') return `https://drive.google.com/uc?export=download&id=${safeId}`
  throw new ImportError(MESSAGES.invalid)
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

/**
 * Reads a fetch Response body with a byte cap.
 * @returns {Promise<Buffer>}
 * @throws {ImportError} 400 tooLarge when the cap is exceeded
 */
export async function readCapped(response, maxBytes, controller) {
  const declared = Number(response.headers.get('content-length'))
  if (declared > maxBytes) {
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

function mediaType(contentType) {
  return String(contentType || '').split(';')[0].trim().toLowerCase()
}

function decodeText(buffer) {
  const text = new TextDecoder('utf-8').decode(buffer)
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

function docName(disposition) {
  const name = sanitizeSourceName(filenameFromDisposition(disposition))
  // The export adds ".txt" to the document title
  return name.replace(/\.txt$/i, '').trim() || 'Google Doc'
}

/**
 * Downloads a public Google Doc (plain-text export) or Drive PDF and extracts its text.
 * @param {string} input  link pasted by the teacher
 * @param {{ fetchImpl?: typeof fetch, timeoutMs?: number, maxBytes?: number }} [deps]
 * @returns {Promise<{ sourceName: string, text: string, pages: number|null, warning: string|null }>}
 * @throws {ImportError}
 */
export async function resolveGoogleLink(input, { fetchImpl = fetch, timeoutMs = FETCH_TIMEOUT_MS, maxBytes = MAX_DOWNLOAD_BYTES } = {}) {
  const link = parseGoogleLink(input)
  const fetchUrl = buildFetchUrl(link)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  let response
  let buffer
  try {
    try {
      response = await fetchImpl(fetchUrl, {
        redirect: 'follow',
        signal: controller.signal,
        headers: { Accept: 'text/plain, application/pdf, */*' },
      })
    } catch (err) {
      throw new ImportError(controller.signal.aborted ? MESSAGES.timeout : MESSAGES.network, 502, err)
    }

    if (response.status === 401 || response.status === 403) throw new ImportError(MESSAGES.notPublic)
    if (response.status === 404) throw new ImportError(MESSAGES.notFound)
    if (response.status === 413) throw new ImportError(MESSAGES.tooLarge)
    if (!response.ok) throw new ImportError(MESSAGES.upstream, 502)

    try {
      buffer = await readCapped(response, maxBytes, controller)
    } catch (err) {
      if (err instanceof ImportError) throw err
      throw new ImportError(controller.signal.aborted ? MESSAGES.timeout : MESSAGES.network, 502, err)
    }
  } finally {
    clearTimeout(timer)
  }

  const type = mediaType(response.headers.get('content-type'))
  const disposition = response.headers.get('content-disposition')

  if (isPdf(buffer) || type === 'application/pdf') {
    const pdf = await extractPdfText(buffer)
    const fallback = link.kind === 'doc' ? 'Google Doc' : 'Fichier Drive'
    const name = sanitizeSourceName(filenameFromDisposition(disposition))
    return { sourceName: name || fallback, ...pdf }
  }

  // Login page, "no access" page or Drive's "too large to scan" page
  if (type === 'text/html' || type === 'application/xhtml+xml') throw new ImportError(MESSAGES.notPublic)

  if (link.kind === 'doc' && (type === 'text/plain' || type === '')) {
    const text = cleanImportedText(decodeText(buffer))
    const warning = lowTextWarning(text) ? DOC_LOW_TEXT_WARNING : null
    return { sourceName: docName(disposition), text, pages: null, warning }
  }

  throw new ImportError(MESSAGES.unsupported)
}
