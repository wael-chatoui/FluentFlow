// Small formatting helpers shared by the teacher pages (French UI).
// Pure functions only (no React, no browser globals): unit-tested in tests/teacherFormat.test.js.
import { MAX_CANVA, MAX_TRANSCRIPT } from '@/utils/ai/options'
import { CircleCheck, Hourglass, Link2, Mail } from 'lucide-react'

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

/** ISO timestamp → '26 septembre 2026'. */
export function formatLongDate(iso) {
  const d = new Date(iso || '')
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

const RELATIVE_STEPS = [
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
]

/** ISO timestamp → 'il y a 5 minutes', 'hier', 'il y a 3 jours'… then a plain date after a week. */
export function formatRelative(iso, now = Date.now()) {
  const t = Date.parse(iso || '')
  if (!Number.isFinite(t)) return '—'
  const seconds = Math.round((t - now) / 1000)
  if (Math.abs(seconds) < 60) return "à l'instant"
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' })
  let value = seconds / 60
  for (const [unit, size] of RELATIVE_STEPS) {
    if (Math.abs(value) < size) return rtf.format(Math.round(value), unit)
    value /= size
  }
  return `le ${formatLongDate(iso)}`
}

export function studentDisplayName(student) {
  return student?.full_name?.trim() || student?.email || 'Élève'
}

/** Title shown for a lesson: teacher title, else the AI title. */
export function lessonTitle(lesson) {
  return lesson?.title?.trim() || lesson?.content?.title?.trim() || 'Leçon sans titre'
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

/**
 * Where a student's account stands, for the status pills: 'placeholder' (created with a
 * join link, the student has not joined yet), 'invited' (never signed in), 'profile'
 * (signed in, onboarding not finished), 'active'.
 * `last_sign_in_at` is only trusted when the API sends the field.
 */
export function accountState(student) {
  if (student?.placeholder) return 'placeholder'
  if (student && 'last_sign_in_at' in student && !student.last_sign_in_at) return 'invited'
  return student?.onboarded_at ? 'active' : 'profile'
}

export const ACCOUNT_STATE_LABELS = {
  placeholder: { icon: Link2, label: 'Invitation en attente' },
  invited: { icon: Mail, label: 'Invitation en attente' },
  profile: { icon: Hourglass, label: 'Profil à compléter' },
  active: { icon: CircleCheck, label: 'Inscrit' },
}

/** 'mm:ss' */
export function formatElapsed(seconds) {
  const s = Math.max(0, Math.floor(seconds))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}

export function plural(n, singular, pluralForm) {
  return `${n} ${n > 1 ? pluralForm || `${singular}s` : singular}`
}

export function formatCount(n) {
  return Number(n || 0).toLocaleString('fr-FR')
}

export function isAbortError(err) {
  return err?.name === 'AbortError'
}

// ---- Lesson sources (transcript / Canva notes) ----
// Same rules as the API (utils/api/validate.js hasEnoughText + validateSources, limits
// from utils/ai/options.js); the parity is checked by tests/teacherFormat.test.js.

/** Minimum number of non-space characters in at least one of the two sources. */
export const SOURCE_MIN_CHARS = 20
/** Maximum length of each source (after trim). */
export const SOURCE_LIMITS = Object.freeze({ transcript: MAX_TRANSCRIPT, canva: MAX_CANVA })

export function nonSpaceLength(value) {
  return typeof value === 'string' ? value.replace(/\s/g, '').length : 0
}

export function hasEnoughText(value, min = SOURCE_MIN_CHARS) {
  return nonSpaceLength(value) >= min
}

/**
 * French error for a transcript + Canva pair, or null when the API will accept it.
 * Fields listed in `stored` are unchanged database values (regeneration): like the API,
 * their length is not checked.
 */
export function sourcesError(transcript, canva, { stored = [] } = {}) {
  const tooLong = (key, value) => !stored.includes(key) && (value || '').trim().length > SOURCE_LIMITS[key]
  if (tooLong('transcript', transcript)) {
    return `La transcription est trop longue (${formatCount(SOURCE_LIMITS.transcript)} caractères maximum) : garde la partie utile du cours.`
  }
  if (tooLong('canva', canva)) {
    return `Les notes Canva sont trop longues (${formatCount(SOURCE_LIMITS.canva)} caractères maximum).`
  }
  if (!hasEnoughText(transcript) && !hasEnoughText(canva)) {
    return `Colle la transcription ou les notes Canva (au moins ${SOURCE_MIN_CHARS} caractères, hors espaces).`
  }
  return null
}

// ---- Generation status ----

/** A 'generating' row older than this can be regenerated (same rule as the API). */
export const STALE_GENERATION_MS = 5 * 60 * 1000

/** True when a generating lesson seems stuck. Trusts the API's `stale` flag when present. */
export function isStaleGeneration(lesson, now = Date.now()) {
  if (lesson?.status !== 'generating') return false
  if (typeof lesson.stale === 'boolean') return lesson.stale
  const t = Date.parse(lesson.updated_at || '')
  return Number.isFinite(t) && now - t > STALE_GENERATION_MS
}
