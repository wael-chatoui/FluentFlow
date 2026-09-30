// GET /api/student/lessons/[id] → { lesson: { id, title, lesson_date, version, content, exercises, drive_url,
//   updated_since_practice }, progress: { best_score, best_total, attempts, last_practiced_at } }
// 404 unless the lesson is the student's own and visible (see utils/api/studentLessons.js).
// `version` (= generated_at) must be echoed back when saving a practice run; progress only
// counts runs of the current version.
import { allowMethods, requireUser, serverError } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { isUuid } from '@/utils/api/validate'
import { lessonVersion, visibleLessons } from '@/utils/api/studentLessons'
import { lastPracticedByLesson, progressByLesson, progressOf } from '@/utils/api/progress'

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return
  const auth = await requireUser(req, res)
  if (!auth) return
  if (auth.role === 'teacher') return res.status(403).json({ error: 'This page is for students.' })
  const studentId = auth.user.id
  const { id } = req.query
  if (!isUuid(id)) return res.status(404).json({ error: 'Lesson not found.' })

  try {
    const admin = createAdminClient()
    const [lesson, sessions] = await Promise.all([
      visibleLessons(admin, studentId, 'id, title, lesson_date, content, exercises, drive_url, generated_at')
        .eq('id', id)
        .maybeSingle(),
      admin
        .from('practice_sessions')
        .select('lesson_id, score, total, completed_at')
        .eq('lesson_id', id)
        .eq('student_id', studentId),
    ])
    for (const r of [lesson, sessions]) if (r.error) throw r.error
    if (!lesson.data) return res.status(404).json({ error: 'Lesson not found.' })

    const l = lesson.data
    const progress = progressOf(progressByLesson(sessions.data, [l]), l.id)
    const lastPracticedAt = lastPracticedByLesson(sessions.data).get(l.id) || null
    return res.status(200).json({
      lesson: {
        id: l.id,
        title: l.title,
        lesson_date: l.lesson_date,
        version: lessonVersion(l),
        content: l.content,
        exercises: Array.isArray(l.exercises) ? l.exercises : [],
        drive_url: l.drive_url || null,
        updated_since_practice: Boolean(lastPracticedAt) && progress.attempts === 0,
      },
      progress: { ...progress, last_practiced_at: lastPracticedAt },
    })
  } catch (err) {
    return serverError(res, err, 'student/lessons/[id]')
  }
}
