// Small display helpers shared by the student pages.

/** Parses 'YYYY-MM-DD' as a LOCAL date (new Date(str) would be UTC midnight). */
export function parseLessonDate(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(typeof value === 'string' ? value : '')
  if (!m) return null
  const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

/** 'YYYY-MM-DD' → e.g. "Sat, Sep 26, 2026" ('' if invalid). */
export function formatLessonDate(value, options) {
  const date = parseLessonDate(value)
  if (!date) return ''
  return date.toLocaleDateString('en-US', options || { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/** Rounded percentage (0–100) or null. */
export function percent(score, total) {
  if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) return null
  return Math.max(0, Math.min(100, Math.round((score / total) * 100)))
}

export function plural(n, word, pluralWord) {
  return `${n} ${n === 1 ? word : pluralWord || `${word}s`}`
}
