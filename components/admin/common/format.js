// Formatting helpers shared by the back-office pages (French UI, fr-FR locale).

/** Joins truthy class names: cx('a', cond && 'b') → 'a b' */
export function cx(...names) {
  return names.filter(Boolean).join(' ')
}

export const LEVEL_LABELS = {
  A1: 'A1 — Débutant',
  A2: 'A2 — Élémentaire',
  B1: 'B1 — Intermédiaire',
  B2: 'B2 — Intermédiaire avancé',
  C1: 'C1 — Avancé',
  C2: 'C2 — Maîtrise',
  unknown: 'Niveau non défini',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** True if the router query value looks like a database id (uuid). */
export function isValidId(value) {
  return typeof value === 'string' && UUID_RE.test(value)
}

export function isAbortError(err) {
  return err?.name === 'AbortError'
}

/** Parses 'YYYY-MM-DD' as a LOCAL date (never `new Date('YYYY-MM-DD')`, which is UTC). */
export function parseLocalDate(ymd) {
  if (typeof ymd !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.slice(0, 10))
  if (!m) return null
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? null : d
}

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  // Bare 'YYYY-MM-DD' → local date; anything longer → ISO timestamp
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) return parseLocalDate(value)
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

/** '2026-09-26' or ISO → '26 sept. 2026' ('—' when empty/invalid). */
export function formatDate(value, { long = false } = {}) {
  const d = toDate(value)
  if (!d) return '—'
  return d.toLocaleDateString(
    'fr-FR',
    long
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : { day: 'numeric', month: 'short', year: 'numeric' }
  )
}

/** ISO → '26 sept. 2026 à 14:05'. */
export function formatDateTime(value) {
  const d = toDate(value)
  if (!d) return '—'
  const date = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `${date} à ${time}`
}

/** 'YYYY-MM-DD' → '26/09' (chart axes). */
export function formatShortDay(value) {
  const d = toDate(value)
  if (!d) return ''
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })
}

/** ISO → 'à l’instant', 'il y a 5 min', 'il y a 3 h', 'il y a 3 j', 'il y a 2 mois', 'il y a 1 an'. */
export function formatRelative(value, now = Date.now()) {
  const d = toDate(value)
  if (!d) return '—'
  const diff = Math.round((now - d.getTime()) / 1000)
  const future = diff < 0
  const s = Math.abs(diff)
  let text
  if (s < 45) return 'à l’instant'
  if (s < 3600) text = `${Math.max(1, Math.round(s / 60))} min`
  else if (s < 86400) text = `${Math.round(s / 3600)} h`
  else if (s < 86400 * 30) text = `${Math.round(s / 86400)} j`
  else if (s < 86400 * 365) text = `${Math.round(s / (86400 * 30))} mois`
  else {
    const years = Math.round(s / (86400 * 365))
    text = `${years} an${years > 1 ? 's' : ''}`
  }
  return future ? `dans ${text}` : `il y a ${text}`
}

const numberFmt = new Intl.NumberFormat('fr-FR')

/** 12345 → '12 345' ('—' for null/NaN). */
export function formatNumber(n, options) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return options ? new Intl.NumberFormat('fr-FR', options).format(Number(n)) : numberFmt.format(Number(n))
}

/** 1234567 → '1,2 M', 12345 → '12,3 k'. */
export function formatCompact(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return new Intl.NumberFormat('fr-FR', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(n))
}

/** 0.4213 → '0,42 $' (USD, 2–4 decimals for small amounts). */
export function formatUsd(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  const v = Number(n)
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: v !== 0 && Math.abs(v) < 1 ? 4 : 2,
  }).format(v)
}

/** 42.50 → '42,50 €' (EUR, 2 decimals). */
export function formatEur(n) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  const v = Number(n)
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(v)
}

/** 87.456 → '87 %' (value already 0–100). */
export function formatPercent(n, digits = 0) {
  if (n === null || n === undefined || Number.isNaN(Number(n))) return '—'
  return `${formatNumber(Number(n), { maximumFractionDigits: digits })} %`
}

/** score/total → '7/10 (70 %)' */
export function formatScore(score, total) {
  if (score === null || score === undefined || !total) return '—'
  return `${score}/${total} (${Math.round((score / total) * 100)} %)`
}

export function plural(n, singular, pluralForm) {
  return `${formatNumber(n)} ${n > 1 ? pluralForm || `${singular}s` : singular}`
}

export function displayName(person) {
  return person?.full_name?.trim() || person?.email || 'Sans nom'
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
