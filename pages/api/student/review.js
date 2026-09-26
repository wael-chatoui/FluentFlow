// GET  /api/student/review → { exercises } (latest result wrong, newest lessons first, max 20)
// POST /api/student/review { answers: [{ exerciseId: '<lessonId>:<exerciseId>', value }] } → { score, total, remaining }
// The server re-grades every answer against the stored exercise and logs one review_attempts row each.
import { allowMethods, requireUser } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { gradeAnswer } from '@/utils/lesson/grading'
import { fail, handleError } from '@/utils/api/errors'
import { STUDENT_VISIBLE, bodyOf, isUuid, parseAnswers } from '@/utils/api/validate'
import { MISTAKE_LESSON_FIELDS, computeMistakes, loadResults } from '@/utils/api/mistakes'

const MAX_ITEMS = 20
const MAX_ANSWERS = 50
const MAX_EXERCISE_ID = 40

async function loadMistakes(admin, studentId) {
  const [lessons, results] = await Promise.all([
    admin
      .from('lessons')
      .select(MISTAKE_LESSON_FIELDS)
      .eq('student_id', studentId)
      .in('status', STUDENT_VISIBLE).not('content', 'is', null)
      .order('lesson_date', { ascending: false })
      .order('created_at', { ascending: false }),
    loadResults(admin, studentId),
  ])
  if (lessons.error) throw lessons.error
  return computeMistakes(lessons.data || [], results.sessions, results.reviewAttempts)
}

// '<lessonId>:<exerciseId>' → { lessonId, exerciseId }, or null if malformed
function parseCompositeId(value) {
  const i = value.indexOf(':')
  if (i < 0) return null
  const lessonId = value.slice(0, i)
  const exerciseId = value.slice(i + 1)
  if (!isUuid(lessonId) || !exerciseId || exerciseId.length > MAX_EXERCISE_ID) return null
  return { lessonId: lessonId.toLowerCase(), exerciseId }
}

async function list(admin, studentId, res) {
  const mistakes = await loadMistakes(admin, studentId)
  return res.status(200).json({
    exercises: mistakes.slice(0, MAX_ITEMS).map(({ lesson, exercise }) => ({
      ...exercise,
      id: `${lesson.id}:${exercise.id}`,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      lesson_date: lesson.lesson_date,
    })),
  })
}

async function submit(admin, studentId, body, res) {
  const answers = parseAnswers(body, { max: MAX_ANSWERS, idLength: 36 + 1 + MAX_EXERCISE_ID })
    .map((a) => ({ ...parseCompositeId(a.exerciseId), value: a.value }))
    .filter((a) => a.lessonId)
  if (!answers.length) fail('No valid answers to grade.')

  // Only the lessons referenced by the answers, and only the student's own visible ones
  const lessonIds = [...new Set(answers.map((a) => a.lessonId))]
  const { data: lessons, error } = await admin
    .from('lessons')
    .select('id, exercises')
    .eq('student_id', studentId)
    .in('id', lessonIds)
    .in('status', STUDENT_VISIBLE).not('content', 'is', null)
  if (error) throw error

  const exercises = new Map()
  for (const l of lessons || []) {
    for (const e of Array.isArray(l.exercises) ? l.exercises : []) exercises.set(`${l.id}:${e?.id}`, e)
  }

  // Unknown exercises are ignored; the first answer per exercise counts
  const seen = new Set()
  const rows = []
  for (const a of answers) {
    const key = `${a.lessonId}:${a.exerciseId}`
    const exercise = exercises.get(key)
    if (!exercise || seen.has(key)) continue
    seen.add(key)
    rows.push({
      student_id: studentId,
      lesson_id: a.lessonId,
      exercise_id: a.exerciseId,
      correct: gradeAnswer(exercise, a.value).correct,
      value: a.value,
    })
  }
  if (!rows.length) fail('No valid answers to grade.')

  const { error: insertError } = await admin.from('review_attempts').insert(rows)
  if (insertError) throw insertError

  const remaining = (await loadMistakes(admin, studentId)).length
  return res.status(200).json({ score: rows.filter((r) => r.correct).length, total: rows.length, remaining })
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return
  const auth = await requireUser(req, res)
  if (!auth) return
  if (auth.role === 'teacher') return res.status(403).json({ error: 'This page is for students.' })
  const studentId = auth.user.id

  try {
    const admin = createAdminClient()
    if (req.method === 'GET') return await list(admin, studentId, res)
    return await submit(admin, studentId, bodyOf(req), res)
  } catch (err) {
    return handleError(res, err, 'student/review')
  }
}
