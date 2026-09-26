// GET /api/student/lessons → { driveFolderUrl, mistakeCount, lessons: [...] } (own visible lessons, newest first)
import { allowMethods, requireUser, serverError } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { STUDENT_VISIBLE } from '@/utils/api/validate'
import { exerciseCount, lastPracticedByLesson, progressByLesson, progressOf, vocabCount } from '@/utils/api/progress'
import { computeMistakes, loadResults } from '@/utils/api/mistakes'

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return
  const auth = await requireUser(req, res)
  if (!auth) return
  if (auth.role === 'teacher') return res.status(403).json({ error: 'This page is for students.' })
  const studentId = auth.user.id

  try {
    const admin = createAdminClient()
    const [profile, lessons, results] = await Promise.all([
      admin.from('profiles').select('drive_folder_url').eq('id', studentId).maybeSingle(),
      admin
        .from('lessons')
        .select(
          'id, title, lesson_date, exercises, generated_at, drive_url, vocabulary:content->vocabulary, expressions:content->expressions'
        )
        .eq('student_id', studentId)
        .in('status', STUDENT_VISIBLE).not('content', 'is', null)
        .order('lesson_date', { ascending: false })
        .order('created_at', { ascending: false }),
      loadResults(admin, studentId),
    ])
    for (const r of [profile, lessons]) if (r.error) throw r.error

    const lessonRows = lessons.data || []
    const progress = progressByLesson(results.sessions)
    const lastPracticed = lastPracticedByLesson(results.sessions)
    return res.status(200).json({
      driveFolderUrl: profile.data?.drive_folder_url || null,
      mistakeCount: computeMistakes(lessonRows, results.sessions, results.reviewAttempts).length,
      lessons: lessonRows.map((l) => ({
        id: l.id,
        title: l.title,
        lesson_date: l.lesson_date,
        exercise_count: exerciseCount(l.exercises),
        vocab_count: vocabCount(l.vocabulary, l.expressions),
        ...progressOf(progress, l.id),
        last_practiced_at: lastPracticed.get(l.id) || null,
        drive_url: l.drive_url || null,
      })),
    })
  } catch (err) {
    return serverError(res, err, 'student/lessons')
  }
}
