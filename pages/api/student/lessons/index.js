// GET /api/student/lessons → { driveFolderUrl, mistakeCount, wordCount, lessons: [{ id, title, lesson_date,
//   version, exercise_count, vocab_count, best_score, best_total, attempts, last_practiced_at,
//   updated_since_practice }] } (own visible lessons, newest first)
// best_score / best_total / attempts only count runs of the current version (null / 0 before);
// updated_since_practice = practiced before the teacher last changed the exercises, not since.
import { allowMethods, requireUser, serverError } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { collectVocabulary, lessonVersion, lessonWordCount, visibleLessons } from '@/utils/api/studentLessons'
import { exerciseCount, lastPracticedByLesson, progressByLesson, progressOf } from '@/utils/api/progress'
import { computeMistakes, loadResults, withMistakeAnswers } from '@/utils/api/mistakes'

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
      visibleLessons(
        admin,
        studentId,
        'id, title, lesson_date, exercises, generated_at, vocabulary:content->vocabulary, expressions:content->expressions'
      )
        .order('lesson_date', { ascending: false })
        .order('created_at', { ascending: false }),
      loadResults(admin, studentId),
    ])
    for (const r of [profile, lessons]) if (r.error) throw r.error

    const lessonRows = lessons.data || []
    const progress = progressByLesson(results.sessions, lessonRows)
    const lastPracticed = lastPracticedByLesson(results.sessions)
    const sessions = await withMistakeAnswers(admin, studentId, lessonRows, results.sessions)
    return res.status(200).json({
      driveFolderUrl: profile.data?.drive_folder_url || null,
      mistakeCount: computeMistakes(lessonRows, sessions, results.reviewAttempts).length,
      wordCount: collectVocabulary(lessonRows).length,
      lessons: lessonRows.map((l) => ({
        id: l.id,
        title: l.title,
        lesson_date: l.lesson_date,
        version: lessonVersion(l),
        exercise_count: exerciseCount(l.exercises),
        vocab_count: lessonWordCount(l),
        ...progressOf(progress, l.id),
        last_practiced_at: lastPracticed.get(l.id) || null,
        updated_since_practice: lastPracticed.has(l.id) && !progress.has(l.id),
      })),
    })
  } catch (err) {
    return serverError(res, err, 'student/lessons')
  }
}
