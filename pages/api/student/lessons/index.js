// GET /api/student/lessons → { driveFolderUrl, lessons: [...] } (own published lessons, newest first)
import { allowMethods, requireUser, serverError } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { STUDENT_VISIBLE } from '@/utils/api/validate'
import { exerciseCount, progressByLesson, progressOf } from '@/utils/api/progress'

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return
  const auth = await requireUser(req, res)
  if (!auth) return
  if (auth.role === 'teacher') return res.status(403).json({ error: 'This page is for students.' })
  const studentId = auth.user.id

  try {
    const admin = createAdminClient()
    const [profile, lessons, sessions] = await Promise.all([
      admin.from('profiles').select('drive_folder_url').eq('id', studentId).maybeSingle(),
      admin
        .from('lessons')
        .select('id, title, lesson_date, exercises, drive_url')
        .eq('student_id', studentId)
        .in('status', STUDENT_VISIBLE).not('content', 'is', null)
        .order('lesson_date', { ascending: false })
        .order('created_at', { ascending: false }),
      admin.from('practice_sessions').select('lesson_id, score, total').eq('student_id', studentId),
    ])
    for (const r of [profile, lessons, sessions]) if (r.error) throw r.error

    const progress = progressByLesson(sessions.data)
    return res.status(200).json({
      driveFolderUrl: profile.data?.drive_folder_url || null,
      lessons: (lessons.data || []).map((l) => ({
        id: l.id,
        title: l.title,
        lesson_date: l.lesson_date,
        exercise_count: exerciseCount(l.exercises),
        ...progressOf(progress, l.id),
        drive_url: l.drive_url || null,
      })),
    })
  } catch (err) {
    return serverError(res, err, 'student/lessons')
  }
}
