// POST /api/student/lessons/[id]/practice { answers: [{ exerciseId, value }] } → { score, total, bestScore }
// The server re-grades every answer; the client's own score is never trusted.
import { allowMethods, requireUser } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { scoreSession } from '@/utils/lesson/grading'
import { fail, handleError } from '@/utils/api/errors'
import { STUDENT_VISIBLE, bodyOf, isUuid } from '@/utils/api/validate'
import { progressByLesson, progressOf } from '@/utils/api/progress'

const MAX_ANSWERS = 100

// Keeps only the answer shapes the grader understands (bounded for storage)
function cleanValue(value) {
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return value.slice(0, 200)
  if (value && typeof value === 'object' && 'mistakes' in value) return { mistakes: Number(value.mistakes) }
  return null
}

function parseAnswers(body) {
  const { answers } = body
  if (!Array.isArray(answers)) fail('answers must be an array.')
  if (answers.length > MAX_ANSWERS) fail(`Too many answers (max ${MAX_ANSWERS}).`)
  return answers
    .filter((a) => a && typeof a === 'object' && typeof a.exerciseId === 'string')
    .map((a) => ({ exerciseId: a.exerciseId.slice(0, 40), value: cleanValue(a.value) }))
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return
  const auth = await requireUser(req, res)
  if (!auth) return
  if (auth.role === 'teacher') return res.status(403).json({ error: 'Practice is for students.' })
  const studentId = auth.user.id
  const { id } = req.query
  if (!isUuid(id)) return res.status(404).json({ error: 'Lesson not found.' })

  try {
    const answers = parseAnswers(bodyOf(req))
    const admin = createAdminClient()

    const { data: lesson, error } = await admin
      .from('lessons')
      .select('id, exercises')
      .eq('id', id)
      .eq('student_id', studentId)
      .in('status', STUDENT_VISIBLE).not('content', 'is', null)
      .maybeSingle()
    if (error) throw error
    if (!lesson) return res.status(404).json({ error: 'Lesson not found.' })

    const exercises = Array.isArray(lesson.exercises) ? lesson.exercises : []
    if (!exercises.length) fail('This lesson has no exercises.')

    const result = scoreSession(exercises, answers)
    const { error: insertError } = await admin.from('practice_sessions').insert({
      lesson_id: lesson.id,
      student_id: studentId,
      score: result.score,
      total: result.total,
      answers: result.answers,
    })
    if (insertError) throw insertError

    const { data: sessions, error: sessionsError } = await admin
      .from('practice_sessions')
      .select('lesson_id, score, total')
      .eq('lesson_id', lesson.id)
      .eq('student_id', studentId)
    if (sessionsError) throw sessionsError

    const best = progressOf(progressByLesson(sessions), lesson.id)
    return res.status(200).json({
      score: result.score,
      total: result.total,
      bestScore: best.best_score ?? result.score,
      bestTotal: best.best_total ?? result.total,
    })
  } catch (err) {
    return handleError(res, err, 'student/lessons/[id]/practice')
  }
}
