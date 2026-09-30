// Helpers for the lesson-import page (/teacher/lessons/import): limits, files,
// the extraction requests and the per-document text checks.
import { api } from '@/utils/apiClient'
import { EXERCISE_TYPES as TYPE_IDS } from '@/utils/lesson/schema'
import { EXERCISE_TYPE_LABELS } from '@/components/teacher/format'
import { GENERATION_LIMITS, IMPORT_LIMITS, megabytes } from '@/utils/import/limits'
import { prepareImportText, sanitizeSourceName } from '@/utils/import/text'
import { ArrowLeftRight, Circle, CircleDot, TextCursorInput } from 'lucide-react'

// Same parser as /api/teacher/import/resolve: a link accepted here is accepted there
export { parseGoogleLink } from '@/utils/import/googleLinks'

export const MAX_SOURCES = IMPORT_LIMITS.maxSources
export const MIN_TEXT = IMPORT_LIMITS.minText
export const MAX_TEXT = IMPORT_LIMITS.maxText
export const MAX_TITLE = IMPORT_LIMITS.maxTitle
export const MAX_INSTRUCTIONS = GENERATION_LIMITS.maxInstructions
export const COUNT_MIN = GENERATION_LIMITS.minCount
export const COUNT_MAX = GENERATION_LIMITS.maxCount
export const COUNT_DEFAULT = GENERATION_LIMITS.defaultCount
export const EXTRACT_CONCURRENCY = 3

// Pictograms (lucide components, rendered with <Icon>), same as the teacher exercise review
const TYPE_ICONS = { mcq: CircleDot, fill_blank: TextCursorInput, match: ArrowLeftRight }

export const EXERCISE_TYPES = TYPE_IDS.map((value) => ({
  value,
  label: EXERCISE_TYPE_LABELS[value] || value,
  icon: TYPE_ICONS[value] || Circle,
}))

const NETWORK_ERROR = 'Connexion impossible. Vérifie ta connexion internet et réessaie.'
const TIMEOUT_ERROR = 'Le serveur met trop de temps à répondre. Réessaie dans un instant.'
const SERVER_ERROR = 'Le serveur a rencontré un problème. Réessaie dans un instant.'
// api()'s fallback when the body has no `error` (a platform error page, a crash…),
// in English when <html lang> is not French yet
const GENERIC_FAILURE = /^(Request failed|La requête a échoué) \(\d+\)\.$/
const FILE_TOO_LARGE = `Fichier trop lourd (${megabytes(IMPORT_LIMITS.maxFileBytes)} maximum).`

let keySeq = 0
export function nextKey() {
  keySeq += 1
  return `src-${Date.now().toString(36)}-${keySeq}`
}

/**
 * Random uuid v4 sent as `clientKey` so a retried import never creates a second
 * lesson. crypto.randomUUID only exists on https / localhost: fall back to
 * getRandomValues (a phone testing the dev server over the LAN).
 */
export function newClientKey() {
  const c = globalThis.crypto
  if (typeof c?.randomUUID === 'function') return c.randomUUID()
  const bytes = c.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** French message for an error thrown by `api()` or the file helpers. */
export function frenchError(err, fallback = 'Une erreur est survenue. Réessaie.') {
  if (!err) return fallback
  if (err.status === 0) return err.code === 'timeout' ? TIMEOUT_ERROR : NETWORK_ERROR
  // Platform body limit: the answer is not our JSON
  if (err.status === 413 && !err.code) return FILE_TOO_LARGE
  // Our routes always send a French `error`; without one the platform answered
  if (err.status >= 500 && (!err.message || GENERIC_FAILURE.test(err.message))) {
    return err.status === 504 ? TIMEOUT_ERROR : SERVER_ERROR
  }
  return err.message || fallback
}

export function formatCount(n) {
  return Number(n || 0).toLocaleString('fr-FR')
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return ''
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`
  return `${(bytes / (1024 * 1024)).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} Mo`
}

// ---- Files ----

export const FILE_ACCEPT = 'application/pdf,.pdf,text/plain,.txt,text/markdown,.md,.markdown'

/** 'pdf' | 'text' for a supported file, else null. */
export function fileKind(file) {
  const name = file?.name || ''
  if (file?.type === 'application/pdf' || /\.pdf$/i.test(name)) return 'pdf'
  if (/\.(txt|md|markdown)$/i.test(name) || file?.type === 'text/plain' || file?.type === 'text/markdown') return 'text'
  return null
}

/** Client-side check of a picked / dropped file → French error or null. */
export function checkFile(file) {
  if (!fileKind(file)) return `« ${file.name} » n'est ni un PDF ni un fichier texte (.txt, .md).`
  if (file.size === 0) return `« ${file.name} » est vide.`
  if (file.size > IMPORT_LIMITS.maxFileBytes) {
    return `« ${file.name} » est trop lourd (${formatBytes(file.size)}, ${megabytes(IMPORT_LIMITS.maxFileBytes)} maximum). Compresse-le ou colle son texte à la main.`
  }
  return null
}

/** Same file picked twice = same name, size and modification date. */
export function fileKey(file) {
  return `file:${file.name}:${file.size}:${file.lastModified || 0}`
}

function normalizeResult(data) {
  if (!data || typeof data !== 'object') {
    const err = new Error('Réponse inattendue du serveur.')
    err.status = 500
    throw err
  }
  return {
    sourceName: typeof data.sourceName === 'string' ? data.sourceName : '',
    text: typeof data.text === 'string' ? data.text : '',
    pages: Number.isFinite(data.pages) ? data.pages : null,
    warning: typeof data.warning === 'string' && data.warning.trim() ? data.warning : null,
  }
}

/** POST /api/teacher/import/extract with the raw PDF. */
export async function extractPdf(file, signal) {
  const data = await api('/api/teacher/import/extract', {
    method: 'POST',
    raw: file,
    signal,
    timeout: 120_000, // up to 4 MB upload + server-side parsing
    headers: { 'Content-Type': 'application/pdf', 'X-File-Name': encodeURIComponent(file.name) },
  })
  return normalizeResult(data)
}

/** POST /api/teacher/import/resolve for a Google Docs / Drive link. */
export async function resolveLink(url, signal) {
  return normalizeResult(await api('/api/teacher/import/resolve', { method: 'POST', body: { url }, signal }))
}

/** A .txt / .md file is read in the browser (same cleanup as the server extraction). */
export async function readTextFile(file) {
  const unreadable = () => {
    const err = new Error(`Impossible de lire « ${file.name} » : ce n'est pas un fichier texte lisible.`)
    err.status = 400
    return err
  }
  let raw
  try {
    raw = await file.text()
  } catch {
    throw unreadable()
  }
  if (raw.includes('\u0000')) throw unreadable()
  const { text, warning } = prepareImportText(raw, {
    lowText: 'Très peu de texte dans ce fichier : vérifie que c’est le bon document.',
  })
  return { sourceName: sanitizeSourceName(file.name, 'Document texte'), text, pages: null, warning }
}

/**
 * What stops a source from being imported (null = ready as far as the text goes).
 * The extraction warning disappears once the teacher edits the text or accepts it.
 * @returns {{ tone: 'loading'|'warning'|'error', message: string, dismissible?: boolean } | null}
 */
export function sourceIssue(row) {
  if (row.extract === 'pending' || row.extract === 'loading') return { tone: 'loading', message: 'Extraction…' }
  if (row.extract === 'error') return { tone: 'error', message: row.extractError || "L'extraction a échoué." }
  const len = row.text.trim().length
  if (len > MAX_TEXT) {
    return { tone: 'error', message: `Texte trop long (${formatCount(len)} caractères, ${formatCount(MAX_TEXT)} maximum).` }
  }
  if (row.warning && !row.warningDismissed && !row.textEdited) {
    return { tone: 'warning', message: row.warning, dismissible: len >= MIN_TEXT }
  }
  if (len === 0) {
    return { tone: 'warning', message: 'Aucun texte trouvé. Colle le texte du document dans « Voir le texte ».' }
  }
  if (len < MIN_TEXT) {
    return {
      tone: 'warning',
      message: `Texte trop court (${formatCount(len)} / ${MIN_TEXT} caractères minimum). Complète-le dans « Voir le texte ».`,
    }
  }
  return null
}
