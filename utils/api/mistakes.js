// "Mistakes" = exercises of visible lessons whose most recent graded result is
// wrong. Results come from practice_sessions.answers and review_attempts; only
// results at/after lessons.generated_at count (older ones graded a previous
// version of the exercises). Shared by /api/student/lessons and /api/student/review.
//
// No `@/` imports here on purpose: computeMistakes is plain JS that can be
// imported directly by node for quick checks.

const PAGE_SIZE = 1000 // PostgREST's default max rows per request

// Microseconds since epoch (Postgres timestamps carry 6 fractional digits); NaN if invalid
function micros(timestamp) {
  if (typeof timestamp !== 'string' || !timestamp) return Number.NaN
  const ms = Date.parse(timestamp)
  if (Number.isNaN(ms)) return Number.NaN
  const extra = /\.\d{3}(\d{1,3})/.exec(timestamp)
  return ms * 1000 + (extra ? Number(extra[1].padEnd(3, '0')) : 0)
}

/**
 * @param {{ id: string, title: string, lesson_date: string, exercises: object[], generated_at: string|null }[]} lessons
 * @param {{ lesson_id: string, answers: { exerciseId: string, correct: boolean }[], completed_at: string }[]} sessions
 * @param {{ lesson_id: string, exercise_id: string, correct: boolean, created_at: string }[]} reviewAttempts
 * @returns {{ lesson: object, exercise: object }[]} newest lesson_date first, then exercise order
 */
export function computeMistakes(lessons, sessions, reviewAttempts) {
  const lessonList = Array.isArray(lessons) ? lessons : []
  const since = new Map(
    lessonList.map((l) => [l.id, l.generated_at ? micros(l.generated_at) : Number.NEGATIVE_INFINITY])
  )
  const latest = new Map() // `${lessonId}:${exerciseId}` → { at, review, correct }

  function record(lessonId, exerciseId, correct, timestamp, review) {
    if (!since.has(lessonId) || typeof exerciseId !== 'string') return
    const at = micros(timestamp)
    if (Number.isNaN(at) || at < since.get(lessonId)) return
    const key = `${lessonId}:${exerciseId}`
    const current = latest.get(key)
    // Newest wins; on a tie a review attempt beats a practice session
    if (!current || at > current.at || (at === current.at && review && !current.review)) {
      latest.set(key, { at, review, correct: correct === true })
    }
  }

  for (const s of sessions || []) {
    for (const a of Array.isArray(s?.answers) ? s.answers : []) {
      record(s.lesson_id, a?.exerciseId, a?.correct, s.completed_at, false)
    }
  }
  for (const r of reviewAttempts || []) {
    record(r?.lesson_id, r?.exercise_id, r?.correct, r?.created_at, true)
  }

  // Newest lesson first; stable sort keeps the caller's order on equal dates
  const ordered = [...lessonList].sort((a, b) => String(b.lesson_date || '').localeCompare(String(a.lesson_date || '')))
  const mistakes = []
  for (const lesson of ordered) {
    for (const exercise of Array.isArray(lesson.exercises) ? lesson.exercises : []) {
      const result = latest.get(`${lesson.id}:${exercise?.id}`)
      if (result && !result.correct) mistakes.push({ lesson, exercise })
    }
  }
  return mistakes
}

// Every row of a query, page by page (a student's history can exceed one page)
async function selectAll(buildQuery) {
  const rows = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await buildQuery().range(from, from + PAGE_SIZE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < PAGE_SIZE) return rows
  }
}

/**
 * Loads a student's graded results (all practice sessions + review attempts).
 * sessions rows also carry score/total, so callers can compute progress from them.
 */
export async function loadResults(admin, studentId) {
  const [sessions, reviewAttempts] = await Promise.all([
    selectAll(() =>
      admin
        .from('practice_sessions')
        .select('id, lesson_id, score, total, answers, completed_at')
        .eq('student_id', studentId)
        .order('completed_at', { ascending: true })
        .order('id', { ascending: true })
    ),
    selectAll(() =>
      admin
        .from('review_attempts')
        .select('id, lesson_id, exercise_id, correct, created_at')
        .eq('student_id', studentId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
    ),
  ])
  return { sessions, reviewAttempts }
}

// Columns computeMistakes needs from `lessons`
export const MISTAKE_LESSON_FIELDS = 'id, title, lesson_date, exercises, generated_at'
