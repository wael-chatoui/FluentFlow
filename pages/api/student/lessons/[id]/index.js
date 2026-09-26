// GET /api/student/lessons/[id] → { lesson, progress } (own + published only, else 404)
import { allowMethods, requireUser, serverError } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { isUuid } from '@/utils/api/validate'
import { progressByLesson, progressOf } from '@/utils/api/progress'

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
      admin
        .from('lessons')
        .select('id, title, lesson_date, content, exercises, drive_url')
        .eq('id', id)
        .eq('student_id', studentId)
        .eq('status', 'published')
        .maybeSingle(),
      admin.from('practice_sessions').select('lesson_id, score, total').eq('lesson_id', id).eq('student_id', studentId),
    ])
    for (const r of [lesson, sessions]) if (r.error) throw r.error
    if (!lesson.data) return res.status(404).json({ error: 'Lesson not found.' })

    const l = lesson.data
    return res.status(200).json({
      lesson: {
        id: l.id,
        title: l.title,
        lesson_date: l.lesson_date,
        content: l.content,
        exercises: Array.isArray(l.exercises) ? l.exercises : [],
        drive_url: l.drive_url || null,
      },
      progress: progressOf(progressByLesson(sessions.data), l.id),
    })
  } catch (err) {
    return serverError(res, err, 'student/lessons/[id]')
  }
}
