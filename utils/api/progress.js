// Practice progress per lesson, computed from practice_sessions rows.
//
// A regeneration (or an exercise edit) replaces a lesson's exercises and bumps
// lessons.generated_at: results recorded before that graded a previous version, so
// progress, best score and mistakes only count results at/after generated_at.

const NO_PROGRESS = { best_score: null, best_total: null, attempts: 0 }

const ratio = (s) => (s.total > 0 ? s.score / s.total : 0)

/** Microseconds since epoch (Postgres timestamps carry 6 fractional digits); NaN if invalid. */
export function micros(timestamp) {
  if (typeof timestamp !== 'string' || !timestamp) return Number.NaN
  const ms = Date.parse(timestamp)
  if (Number.isNaN(ms)) return Number.NaN
  const extra = /\.\d{3}(\d{1,3})/.exec(timestamp)
  return ms * 1000 + (extra ? Number(extra[1].padEnd(3, '0')) : 0)
}

/**
 * lesson id → time (µs) from which its results count: lessons.generated_at, or
 * -Infinity when unknown (rows generated before the column existed).
 * @param {{ id: string, generated_at?: string|null }[]} lessons
 * @returns {Map<string, number>}
 */
export function currentSince(lessons) {
  const since = new Map()
  for (const l of Array.isArray(lessons) ? lessons : []) {
    const at = micros(l?.generated_at)
    since.set(l?.id, Number.isNaN(at) ? Number.NEGATIVE_INFINITY : at)
  }
  return since
}

/** True when a result recorded at `timestamp` graded the current version of lesson `lessonId`. */
export function isCurrent(since, lessonId, timestamp) {
  if (!since.has(lessonId)) return false
  const at = micros(timestamp)
  return !Number.isNaN(at) && at >= since.get(lessonId)
}

/**
 * @param {{ lesson_id: string, score: number, total: number, completed_at?: string }[]} sessions
 * @param {{ id: string, generated_at?: string|null }[]} [lessons]  when given, only sessions of
 *   these lessons recorded at/after their generated_at count (the student's current progress)
 * @returns {Map<string, { best_score: number, best_total: number, attempts: number }>}
 *   best = the session with the highest score/total ratio
 */
export function progressByLesson(sessions, lessons) {
  const since = lessons ? currentSince(lessons) : null
  const map = new Map()
  for (const s of sessions || []) {
    if (since && !isCurrent(since, s.lesson_id, s.completed_at)) continue
    const current = map.get(s.lesson_id)
    if (!current) {
      map.set(s.lesson_id, { best_score: s.score, best_total: s.total, attempts: 1, best: s })
      continue
    }
    current.attempts += 1
    if (ratio(s) > ratio(current.best)) {
      current.best = s
      current.best_score = s.score
      current.best_total = s.total
    }
  }
  return map
}

/** Progress of one lesson from a progressByLesson map. */
export function progressOf(map, lessonId) {
  const p = map.get(lessonId)
  return p ? { best_score: p.best_score, best_total: p.best_total, attempts: p.attempts } : { ...NO_PROGRESS }
}

export const exerciseCount = (exercises) => (Array.isArray(exercises) ? exercises.length : 0)

/**
 * Every session counts here (also those of a previous version): it answers "when did
 * the student last practice this lesson?".
 * @param {{ lesson_id: string, completed_at: string }[]} sessions
 * @returns {Map<string, string>} lesson id → completed_at of its latest practice session
 */
export function lastPracticedByLesson(sessions) {
  const map = new Map()
  for (const s of sessions || []) {
    const current = map.get(s.lesson_id)
    if (!current || micros(s.completed_at) > micros(current)) map.set(s.lesson_id, s.completed_at)
  }
  return map
}
