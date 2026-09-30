// GET  /api/student/review → { total, exercises: [{ ...exercise, id: '<lessonId>:<exerciseId>', lessonId,
//   lessonTitle, lesson_date, version }] } — latest result wrong, newest lessons first, max 20 per
//   round; `total` = every current mistake.
// POST /api/student/review { answers: [{ exerciseId: '<lessonId>:<exerciseId>', value, version? }] }
//   → { score, total, remaining, skipped }
// The server re-grades every answer against the stored exercise and logs one review_attempts row
// each. Answers it can no longer grade are counted in `skipped` instead: the teacher replaced the
// lesson's exercises since the round started (version changed), removed that exercise, or hid or
// deleted the lesson. 400 only when no answer was well-formed.
import { allowMethods, requireUser } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { gradeAnswer } from '@/utils/lesson/grading'
import { fail, handleError } from '@/utils/api/errors'
import { bodyOf, isUuid, parseAnswers } from '@/utils/api/validate'
import { isSameVersion, lessonVersion, lessonsReplacedSince, visibleLessons } from '@/utils/api/studentLessons'
import { MISTAKE_LESSON_FIELDS, computeMistakes, loadResults, withMistakeAnswers } from '@/utils/api/mistakes'

const MAX_ITEMS = 20
const MAX_ANSWERS = 50
const MAX_EXERCISE_ID = 40
const MAX_ID = 36 + 1 + MAX_EXERCISE_ID

async function loadMistakes(admin, studentId) {
  const [lessons, results] = await Promise.all([
    visibleLessons(admin, studentId, MISTAKE_LESSON_FIELDS)
      .order('lesson_date', { ascending: false })
      .order('created_at', { ascending: false }),
    loadResults(admin, studentId),
  ])
  if (lessons.error) throw lessons.error
  const lessonRows = lessons.data || []
  const sessions = await withMistakeAnswers(admin, studentId, lessonRows, results.sessions)
  return computeMistakes(lessonRows, sessions, results.reviewAttempts)
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
    total: mistakes.length,
    exercises: mistakes.slice(0, MAX_ITEMS).map(({ lesson, exercise }) => ({
      ...exercise,
      id: `${lesson.id}:${exercise.id}`,
      lessonId: lesson.id,
      lessonTitle: lesson.title,
      lesson_date: lesson.lesson_date,
      version: lessonVersion(lesson),
    })),
  })
}

async function submit(admin, studentId, body, res) {
  // parseAnswers validates the array and the values; the optional versions are read alongside
  const versions = new Map()
  for (const a of Array.isArray(body.answers) ? body.answers : []) {
    if (typeof a?.exerciseId !== 'string' || typeof a.version !== 'string') continue
    const key = a.exerciseId.slice(0, MAX_ID)
    if (!versions.has(key)) versions.set(key, a.version)
  }
  const answers = parseAnswers(body, { max: MAX_ANSWERS, idLength: MAX_ID })
    .map((a) => ({ ...parseCompositeId(a.exerciseId), value: a.value, version: versions.get(a.exerciseId) }))
    .filter((a) => a.lessonId)
  if (!answers.length) fail('No valid answers to grade.')

  // Only the lessons referenced by the answers, and only the student's own visible ones
  const lessonIds = [...new Set(answers.map((a) => a.lessonId))]
  const { data: lessons, error } = await visibleLessons(admin, studentId, 'id, exercises, generated_at').in('id', lessonIds)
  if (error) throw error

  const lessonById = new Map((lessons || []).map((l) => [l.id, l]))
  const exercises = new Map()
  for (const l of lessons || []) {
    for (const e of Array.isArray(l.exercises) ? l.exercises : []) exercises.set(`${l.id}:${e?.id}`, e)
  }

  // The first answer per exercise counts. The others are well-formed answers the server
  // can't grade anymore: skipped, so the round still saves (with a note) instead of failing
  // on every retry.
  const seen = new Set()
  const rows = []
  let skipped = 0
  for (const a of answers) {
    const key = `${a.lessonId}:${a.exerciseId}`
    if (seen.has(key)) continue
    seen.add(key)
    const lesson = lessonById.get(a.lessonId)
    const exercise = exercises.get(key)
    if (!lesson || !exercise || (a.version !== undefined && !isSameVersion(a.version, lesson))) {
      skipped += 1
      continue
    }
    rows.push({
      student_id: studentId,
      lesson_id: a.lessonId,
      exercise_id: a.exerciseId,
      correct: gradeAnswer(exercise, a.value).correct,
      value: a.value,
    })
  }

  let graded = rows
  if (rows.length) {
    const { data: inserted, error: insertError } = await admin
      .from('review_attempts')
      .insert(rows)
      .select('id, lesson_id')
    if (insertError) throw insertError
    // A lesson replaced between the version check and the insert: those rows graded the old
    // exercises, undo them (see lessonsReplacedSince)
    const gradedLessons = [...new Set(rows.map((r) => r.lesson_id))].map((id) => lessonById.get(id))
    const replaced = await lessonsReplacedSince(admin, gradedLessons)
    if (replaced.size) {
      const undo = (inserted || []).filter((r) => replaced.has(r.lesson_id)).map((r) => r.id)
      if (undo.length) {
        const { error: deleteError } = await admin.from('review_attempts').delete().in('id', undo)
        if (deleteError) throw deleteError
      }
      graded = rows.filter((r) => !replaced.has(r.lesson_id))
      skipped += rows.length - graded.length
    }
  }

  const remaining = (await loadMistakes(admin, studentId)).length
  const score = graded.filter((r) => r.correct).length
  return res.status(200).json({ score, total: graded.length, remaining, skipped })
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
