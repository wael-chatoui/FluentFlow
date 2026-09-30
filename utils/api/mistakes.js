// "Mistakes" = exercises of visible lessons whose most recent graded result is
// wrong. Results come from practice_sessions.answers and review_attempts; only
// results at/after lessons.generated_at count (older ones graded a previous
// version of the exercises). Shared by /api/student/lessons and /api/student/review.
import { currentSince, isCurrent, micros } from '@/utils/api/progress'

const PAGE_SIZE = 1000 // PostgREST's default max rows per request
const ID_CHUNK = 100 // ids per `in` filter (they travel in the URL)

/**
 * @param {{ id: string, title: string, lesson_date: string, exercises: object[], generated_at: string|null }[]} lessons
 * @param {{ lesson_id: string, answers: { exerciseId: string, correct: boolean }[], completed_at: string }[]} sessions
 * @param {{ lesson_id: string, exercise_id: string, correct: boolean, created_at: string }[]} reviewAttempts
 * @returns {{ lesson: object, exercise: object }[]} newest lesson_date first, then exercise order
 */
export function computeMistakes(lessons, sessions, reviewAttempts) {
  const lessonList = Array.isArray(lessons) ? lessons : []
  const since = currentSince(lessonList)
  const latest = new Map() // `${lessonId}:${exerciseId}` → { at, review, correct }

  function record(lessonId, exerciseId, correct, timestamp, review) {
    if (typeof exerciseId !== 'string' || !isCurrent(since, lessonId, timestamp)) return
    const at = micros(timestamp)
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
 * Loads a student's graded results, light: every practice session WITHOUT its answers
 * (score/total for progress, completed_at for "last practiced") and every review attempt.
 * The answers are the heavy part of a session and only the newest ones can decide a
 * mistake: withMistakeAnswers() adds those.
 * Both queries use an index leading with student_id (0003, 0006).
 */
export async function loadResults(admin, studentId) {
  const [sessions, reviewAttempts] = await Promise.all([
    selectAll(() =>
      admin
        .from('practice_sessions')
        .select('id, lesson_id, score, total, completed_at')
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

/**
 * Sessions whose answers are needed next to know the latest practice result of every
 * exercise: per lesson, its current sessions newest first, up to the first ones not loaded
 * yet, and none once each exercise of the lesson has a result in the loaded ones.
 * Sessions recorded at the same instant go together (computeMistakes breaks ties among them).
 * @param {{ id: string, exercises: object[], generated_at?: string|null }[]} lessons
 * @param {{ id: string, lesson_id: string, completed_at: string }[]} sessions
 * @param {Map<string, object[]>} loaded  session id → answers already loaded
 * @param {{ all?: boolean }} [options]  all: every session not loaded yet of the lessons
 *   still missing results, instead of only the next ones
 * @returns {string[]} session ids
 */
export function answersNeeded(lessons, sessions, loaded, { all = false } = {}) {
  const lessonList = Array.isArray(lessons) ? lessons : []
  const since = currentSince(lessonList)
  const byLesson = new Map()
  for (const s of sessions || []) {
    if (!isCurrent(since, s.lesson_id, s.completed_at)) continue
    if (!byLesson.has(s.lesson_id)) byLesson.set(s.lesson_id, [])
    byLesson.get(s.lesson_id).push({ s, at: micros(s.completed_at) })
  }

  const ids = []
  for (const lesson of lessonList) {
    const list = (byLesson.get(lesson.id) || []).sort((a, b) => b.at - a.at)
    const missing = new Set(
      (Array.isArray(lesson.exercises) ? lesson.exercises : []).map((e) => e?.id).filter((id) => typeof id === 'string')
    )
    for (let i = 0; i < list.length && missing.size > 0; ) {
      let j = i
      while (j < list.length && list[j].at === list[i].at) j += 1
      const group = list.slice(i, j).map((x) => x.s)
      const unloaded = group.filter((s) => !loaded.has(s.id))
      if (unloaded.length) {
        ids.push(...unloaded.map((s) => s.id))
        if (!all) break
      }
      for (const s of group) for (const a of loaded.get(s.id) || []) missing.delete(a?.exerciseId)
      i = j
    }
  }
  return ids
}

/**
 * `sessions` (from loadResults) with the answers computeMistakes needs: the newest current
 * session of each lesson (a run answers every exercise), older ones only for lessons where
 * some exercise still has no result. Other sessions keep no answers. Two rounds at most,
 * so the cost follows the number of lessons, not the student's whole history.
 */
export async function withMistakeAnswers(admin, studentId, lessons, sessions) {
  const loaded = new Map()
  for (const all of [false, true]) {
    const ids = answersNeeded(lessons, sessions, loaded, { all })
    if (!ids.length) break
    const chunks = []
    for (let i = 0; i < ids.length; i += ID_CHUNK) chunks.push(ids.slice(i, i + ID_CHUNK))
    const pages = await Promise.all(
      chunks.map((chunk) =>
        admin.from('practice_sessions').select('id, answers').eq('student_id', studentId).in('id', chunk)
      )
    )
    for (const { data, error } of pages) {
      if (error) throw error
      for (const row of data || []) loaded.set(row.id, Array.isArray(row.answers) ? row.answers : [])
    }
    for (const id of ids) if (!loaded.has(id)) loaded.set(id, []) // deleted meanwhile
  }
  return (sessions || []).map((s) => (loaded.has(s.id) ? { ...s, answers: loaded.get(s.id) } : s))
}

// Columns computeMistakes needs from `lessons`
export const MISTAKE_LESSON_FIELDS = 'id, title, lesson_date, exercises, generated_at'
