// Helpers for the lesson-import page (/teacher/lessons/import): limits, source
// titles, Google link checks and the two extraction requests.

export const MAX_SOURCES = 20
export const MAX_PDF_BYTES = 4 * 1024 * 1024
export const MIN_TEXT = 200
export const MAX_TEXT = 150000
export const MAX_TITLE = 120
export const MAX_INSTRUCTIONS = 1000
export const COUNT_MIN = 4
export const COUNT_MAX = 20
export const COUNT_DEFAULT = 10
export const EXTRACT_CONCURRENCY = 3

export const EXERCISE_TYPES = [
  { value: 'mcq', label: 'QCM', icon: '🔘' },
  { value: 'fill_blank', label: 'Phrases à trous', icon: '✏️' },
  { value: 'match', label: 'Association', icon: '🔗' },
]

export const NETWORK_ERROR = 'Connexion impossible. Vérifie ta connexion internet et réessaie.'

let keySeq = 0
export function nextKey() {
  keySeq += 1
  return `src-${Date.now().toString(36)}-${keySeq}`
}

/** French message for an error thrown by `api()` or the upload helpers. */
export function frenchError(err, fallback = 'Une erreur est survenue. Réessaie.') {
  if (!err) return fallback
  if (err.status === 0) return NETWORK_ERROR
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

function normalizeName(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/** Prefixes that count as "the student's name" at the start of a file name. */
function studentPrefixes(student) {
  if (!student) return []
  const out = new Set()
  const full = student.full_name?.trim()
  if (full) {
    out.add(normalizeName(full))
    out.add(normalizeName(full.split(/\s+/)[0]))
  }
  const local = student.email?.split('@')[0]
  if (local) {
    out.add(normalizeName(local))
    out.add(normalizeName(local.split(/[._-]/)[0]))
  }
  out.delete('')
  return [...out]
}

/**
 * Default lesson title from a file / document name:
 * "Rebecca_L07_Vouloir-Vocab.pdf" (student Rebecca) → "L07 Vouloir Vocab".
 */
export function deriveTitle(sourceName, student) {
  if (!sourceName) return ''
  let base = String(sourceName).trim().replace(/\.(pdf|docx?|odt|txt)$/i, '')
  const m = /^([^_]+)_(.+)$/.exec(base)
  if (m && studentPrefixes(student).includes(normalizeName(m[1]))) base = m[2]
  base = base.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim()
  return base.slice(0, MAX_TITLE)
}

function isPdfFile(file) {
  return file?.type === 'application/pdf' || /\.pdf$/i.test(file?.name || '')
}

/** Client-side check of a picked / dropped file → French error or null. */
export function checkFile(file) {
  if (!isPdfFile(file)) return `« ${file.name} » n'est pas un PDF.`
  if (file.size === 0) return `« ${file.name} » est vide.`
  if (file.size > MAX_PDF_BYTES) {
    return `« ${file.name} » est trop lourd (${formatBytes(file.size)}, 4 Mo maximum). Compresse-le ou colle son texte à la main.`
  }
  return null
}

export function fileKey(file) {
  return `file:${file.name}:${file.size}`
}

/**
 * Checks a pasted Google Docs / Drive link.
 * @returns {{ url: string, dedupeKey: string, label: string } | { error: string }}
 */
export function parseGoogleLink(raw) {
  const value = String(raw || '').trim()
  if (!value) return { error: 'Colle un lien Google Docs ou Google Drive.' }
  let u
  try {
    u = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`)
  } catch {
    return { error: "Ce lien n'est pas valide." }
  }
  const host = u.hostname.toLowerCase()
  if (host !== 'docs.google.com' && host !== 'drive.google.com') {
    return { error: 'Seuls les liens Google Docs (docs.google.com) ou Google Drive (drive.google.com) sont acceptés.' }
  }
  if (host === 'drive.google.com' && /\/folders\//.test(u.pathname)) {
    return { error: 'Les dossiers Drive ne sont pas pris en charge : ajoute les fichiers un par un.' }
  }
  if (host === 'docs.google.com' && !u.pathname.startsWith('/document/')) {
    return { error: 'Seuls les documents Google Docs sont acceptés (pas Sheets ni Slides).' }
  }
  const id = /\/d\/([\w-]{10,})/.exec(u.pathname)?.[1] || u.searchParams.get('id') || ''
  const isDoc = host === 'docs.google.com'
  return {
    url: u.toString(),
    dedupeKey: `link:${id || u.toString()}`,
    label: isDoc ? 'Document Google Docs' : 'Fichier Google Drive',
  }
}

async function readError(res) {
  const data = await res.json().catch(() => ({}))
  if (res.status === 401 && typeof window !== 'undefined') window.location.href = '/login'
  if (data?.error) return data.error
  if (res.status === 413) return 'Fichier trop lourd (4 Mo maximum).'
  return `La requête a échoué (${res.status}).`
}

function httpError(message, status) {
  const err = new Error(message)
  err.status = status
  return err
}

async function postForText(path, init) {
  let res
  try {
    res = await fetch(path, { method: 'POST', ...init })
  } catch (err) {
    if (err?.name === 'AbortError') throw err
    throw httpError(NETWORK_ERROR, 0)
  }
  if (!res.ok) throw httpError(await readError(res), res.status)
  const data = await res.json().catch(() => null)
  if (!data || typeof data !== 'object') throw httpError('Réponse inattendue du serveur.', 500)
  return {
    sourceName: typeof data.sourceName === 'string' ? data.sourceName : '',
    text: typeof data.text === 'string' ? data.text : '',
    pages: Number.isFinite(data.pages) ? data.pages : null,
    warning: typeof data.warning === 'string' && data.warning.trim() ? data.warning : null,
  }
}

/** POST /api/teacher/import/extract with the raw PDF. */
export function extractPdf(file, signal) {
  return postForText('/api/teacher/import/extract', {
    signal,
    headers: {
      'Content-Type': 'application/pdf',
      'X-File-Name': encodeURIComponent(file.name),
    },
    body: file,
  })
}

/** POST /api/teacher/import/resolve for a Google Docs / Drive link. */
export function resolveLink(url, signal) {
  return postForText('/api/teacher/import/resolve', {
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  })
}

/**
 * What stops a source from being imported (null = ready as far as the text goes).
 * @returns {{ tone: 'loading'|'warning'|'error', message: string, dismissible?: boolean } | null}
 */
export function sourceIssue(row) {
  if (row.extract === 'pending' || row.extract === 'loading') return { tone: 'loading', message: 'Extraction…' }
  if (row.extract === 'error') return { tone: 'error', message: row.extractError || "L'extraction a échoué." }
  const len = row.text.trim().length
  if (len > MAX_TEXT) {
    return { tone: 'error', message: `Texte trop long (${formatCount(len)} caractères, ${formatCount(MAX_TEXT)} maximum).` }
  }
  if (row.warning && !row.textEdited) {
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
