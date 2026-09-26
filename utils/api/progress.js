// Practice progress per lesson, computed from practice_sessions rows.

const NO_PROGRESS = { best_score: null, best_total: null, attempts: 0 }

const ratio = (s) => (s.total > 0 ? s.score / s.total : 0)

/**
 * @param {{ lesson_id: string, score: number, total: number }[]} sessions
 * @returns {Map<string, { best_score: number, best_total: number, attempts: number }>}
 *   best = the session with the highest score/total ratio
 */
export function progressByLesson(sessions) {
  const map = new Map()
  for (const s of sessions || []) {
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
 * @param {{ lesson_id: string, completed_at: string }[]} sessions
 * @returns {Map<string, string>} lesson id → completed_at of its latest practice session
 */
export function lastPracticedByLesson(sessions) {
  const map = new Map()
  for (const s of sessions || []) {
    const current = map.get(s.lesson_id)
    if (!current || Date.parse(s.completed_at) > Date.parse(current)) map.set(s.lesson_id, s.completed_at)
  }
  return map
}

/** Number of vocabulary words + expressions in a lesson's content. */
export const vocabCount = (vocabulary, expressions) =>
  (Array.isArray(vocabulary) ? vocabulary.length : 0) + (Array.isArray(expressions) ? expressions.length : 0)
