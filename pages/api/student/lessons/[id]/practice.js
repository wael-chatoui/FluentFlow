// POST /api/student/lessons/[id]/practice { answers: [{ exerciseId, value }], version, runId }
//   → { score, total, bestScore, bestTotal, duplicate?: true }
// The server re-grades every answer (first answer per exercise counts) instead of using the
// client's score. The correct answers are in the GET payload for instant feedback, so a
// determined student could still post a perfect run: accepted trade-off for a self-practice tool.
// - version = lessons.generated_at the run was played on: 409 `lesson_updated` if the teacher
//   changed the exercises since (the answers would be graded against different exercises),
//   also when that happens between the check and the insert (the stored run is undone).
// - runId = uuid made by the player per run: a retried save returns the stored result instead of
//   recording the run twice (unique index practice_sessions(student_id, client_run_id), 0006).
// - 409 `lesson_unavailable` when the lesson is no longer visible (hidden or deleted while the
//   student was practicing): the run can never be saved, retrying is pointless.
// 400 only for a request that was malformed from the start.
import { allowMethods, requireUser } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { scoreSession } from '@/utils/lesson/grading'
import { HttpError, fail, handleError } from '@/utils/api/errors'
import { bodyOf, isUuid, parseAnswers } from '@/utils/api/validate'
import { isSameVersion, lessonsReplacedSince, visibleLessons } from '@/utils/api/studentLessons'
import { micros, progressByLesson, progressOf } from '@/utils/api/progress'

const MAX_ANSWERS = 100
const MAX_VERSION_LENGTH = 64
const OUT_OF_DATE = 'This page is out of date. Please reload it and try again.'

// Required: without it a retried save would record the run twice. The player always
// sends one, so a missing runId means a page loaded before this contract (reload it).
function parseRunId(value) {
  if (value === undefined || value === null) fail(OUT_OF_DATE)
  if (!isUuid(value)) fail('Invalid run id.')
  return value.toLowerCase()
}

const lessonUpdated = () => new HttpError(409, 'This lesson was just updated by your teacher.', 'lesson_updated')

async function findRun(admin, studentId, runId) {
  const { data, error } = await admin
    .from('practice_sessions')
    .select('lesson_id, score, total, completed_at')
    .eq('student_id', studentId)
    .eq('client_run_id', runId)
    .maybeSingle()
  if (error) throw error
  return data
}

async function deleteRun(admin, studentId, runId) {
  const { error } = await admin
    .from('practice_sessions')
    .delete()
    .eq('student_id', studentId)
    .eq('client_run_id', runId)
  if (error) throw error
}

// Best current-version result, the given run included
async function reply(res, admin, studentId, lesson, run, duplicate) {
  const { data: sessions, error } = await admin
    .from('practice_sessions')
    .select('lesson_id, score, total, completed_at')
    .eq('lesson_id', lesson.id)
    .eq('student_id', studentId)
  if (error) throw error

  const best = progressOf(progressByLesson(sessions, [lesson]), lesson.id)
  return res.status(200).json({
    score: run.score,
    total: run.total,
    bestScore: best.best_score ?? run.score,
    bestTotal: best.best_total ?? run.total,
    ...(duplicate ? { duplicate: true } : {}),
  })
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
    const body = bodyOf(req)
    const answers = parseAnswers(body, { max: MAX_ANSWERS, idLength: 40 })
    if (!answers.length) fail('No valid answers to grade.')
    const runId = parseRunId(body.runId)
    const { version } = body
    if (typeof version !== 'string' || version.length > MAX_VERSION_LENGTH) fail(OUT_OF_DATE)
    const admin = createAdminClient()

    const { data: lesson, error } = await visibleLessons(admin, studentId, 'id, exercises, generated_at')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!lesson) throw new HttpError(409, 'This lesson isn’t available anymore.', 'lesson_unavailable')

    if (!isSameVersion(version, lesson)) {
      const stored = await findRun(admin, studentId, runId)
      if (stored?.lesson_id === lesson.id) {
        // A retry of a run saved before the update still gets its stored result. Stored at/after
        // the update, it slipped between the version check and the insert: graded against the
        // old exercises but counted as current progress, so it is undone.
        const storedAfterUpdate = micros(stored.completed_at) >= micros(lesson.generated_at) // false if unknown
        if (!storedAfterUpdate) return await reply(res, admin, studentId, lesson, stored, true)
        await deleteRun(admin, studentId, runId)
      }
      throw lessonUpdated()
    }

    // Well-formed answers that match no exercise anymore: the teacher removed the exercises
    // during the run (a pure removal keeps the version)
    const exercises = Array.isArray(lesson.exercises) ? lesson.exercises : []
    const result = scoreSession(exercises, answers)
    if (!result.answers.length) throw lessonUpdated()

    const { error: insertError } = await admin.from('practice_sessions').insert({
      lesson_id: lesson.id,
      student_id: studentId,
      score: result.score,
      total: result.total,
      answers: result.answers,
      client_run_id: runId,
    })
    if (insertError) {
      // 23505 = this run was already saved (lost response, retry): answer with the stored result
      if (insertError.code !== '23505') throw insertError
      const stored = await findRun(admin, studentId, runId)
      if (!stored || stored.lesson_id !== lesson.id) fail('Invalid run id.')
      return await reply(res, admin, studentId, lesson, stored, true)
    }

    // No transaction around the version check and the insert: if the teacher replaced the
    // exercises in between, this run was graded against the old ones
    if ((await lessonsReplacedSince(admin, [lesson])).size) {
      await deleteRun(admin, studentId, runId)
      throw lessonUpdated()
    }

    return await reply(res, admin, studentId, lesson, result, false)
  } catch (err) {
    return handleError(res, err, 'student/lessons/[id]/practice')
  }
}
