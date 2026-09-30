// GET /api/student/vocabulary → { items: [{ fr, en, example, kind, lessonId, lessonTitle, lesson_date, lessonIds }],
//   lessons: [{ id, title, lesson_date }] }
// Vocabulary + expressions of every visible lesson, newest first, one entry per French
// word/expression (case, accents, apostrophes and punctuation ignored; the newest lesson's
// version is kept, lessonIds = every lesson it appears in). Same rule as `wordCount` on
// /api/student/lessons. `lessons` = visible lessons with words (flashcards deck picker).
import { allowMethods, requireUser, serverError } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { collectVocabulary, lessonsWithWords, visibleLessons } from '@/utils/api/studentLessons'

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return
  const auth = await requireUser(req, res)
  if (!auth) return
  if (auth.role === 'teacher') return res.status(403).json({ error: 'This page is for students.' })
  const studentId = auth.user.id

  try {
    const { data: lessons, error } = await visibleLessons(
      createAdminClient(),
      studentId,
      'id, title, lesson_date, vocabulary:content->vocabulary, expressions:content->expressions'
    )
      .order('lesson_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error

    return res.status(200).json({ items: collectVocabulary(lessons), lessons: lessonsWithWords(lessons) })
  } catch (err) {
    return serverError(res, err, 'student/vocabulary')
  }
}
