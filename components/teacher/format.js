// Small formatting helpers shared by the teacher pages (French UI).

export const LEVEL_LABELS = {
  A1: 'A1 — Débutant',
  A2: 'A2 — Élémentaire',
  B1: 'B1 — Intermédiaire',
  B2: 'B2 — Intermédiaire avancé',
  C1: 'C1 — Avancé',
  C2: 'C2 — Maîtrise',
  unknown: 'Niveau non défini',
}

export const EXERCISE_TYPE_LABELS = {
  mcq: 'QCM',
  fill_blank: 'Texte à trous',
  match: 'Association',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True if the router query value looks like a database id (uuid). */
export function isValidId(value) {
  return typeof value === 'string' && UUID_RE.test(value)
}

/** Parses 'YYYY-MM-DD' as a LOCAL date (never `new Date('YYYY-MM-DD')`, which is UTC). */
export function parseLocalDate(ymd) {
  if (typeof ymd !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd)
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

/** Today's local date as 'YYYY-MM-DD'. */
export function todayLocal() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 'YYYY-MM-DD' → '26 sept. 2026' (or long form with weekday). */
export function formatLessonDate(ymd, { long = false } = {}) {
  const d = parseLocalDate(ymd)
  if (!d) return '—'
  return d.toLocaleDateString(
    'fr-FR',
    long
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : { day: 'numeric', month: 'short', year: 'numeric' }
  )
}

/** ISO timestamp → '26 sept. 2026 à 14:05'. */
export function formatDateTime(iso) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const date = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `${date} à ${time}`
}

export function studentDisplayName(student) {
  return student?.full_name?.trim() || student?.email || 'Élève'
}

export function initialsOf(text) {
  const base = (text || '?').split('@')[0]
  const letters = base
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
  return letters.slice(0, 2) || '?'
}

export function levelBadgeText(level) {
  return level && level !== 'unknown' ? level : null
}

/** 'mm:ss' */
export function formatElapsed(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function plural(n, singular, pluralForm) {
  return `${n} ${n > 1 ? pluralForm || `${singular}s` : singular}`
}

export function isAbortError(err) {
  return err?.name === 'AbortError'
}
