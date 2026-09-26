// GET /api/student/vocabulary → { items: [{ fr, en, example, kind, lessonId, lessonTitle, lesson_date }] }
// Vocabulary + expressions of every visible lesson, newest first, one entry per French
// word/expression (case/accents-insensitive; the newest lesson's version is kept).
import { allowMethods, requireUser, serverError } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { stripAccents } from '@/utils/lesson/grading'
import { STUDENT_VISIBLE } from '@/utils/api/validate'

const dedupeKey = (fr) => stripAccents(fr.toLowerCase()).replace(/\s+/g, ' ').trim()

const entries = (value) =>
  (Array.isArray(value) ? value : []).filter(
    (v) => v && typeof v.fr === 'string' && v.fr.trim() && typeof v.en === 'string'
  )

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return
  const auth = await requireUser(req, res)
  if (!auth) return
  if (auth.role === 'teacher') return res.status(403).json({ error: 'This page is for students.' })
  const studentId = auth.user.id

  try {
    const { data: lessons, error } = await createAdminClient()
      .from('lessons')
      .select('id, title, lesson_date, vocabulary:content->vocabulary, expressions:content->expressions')
      .eq('student_id', studentId)
      .in('status', STUDENT_VISIBLE).not('content', 'is', null)
      .order('lesson_date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error

    const seen = new Set()
    const items = []
    for (const lesson of lessons || []) {
      const all = [
        ...entries(lesson.vocabulary).map((v) => ({ v, kind: 'word' })),
        ...entries(lesson.expressions).map((v) => ({ v, kind: 'expression' })),
      ]
      for (const { v, kind } of all) {
        const key = dedupeKey(v.fr)
        if (seen.has(key)) continue
        seen.add(key)
        items.push({
          fr: v.fr,
          en: v.en,
          example: typeof v.example === 'string' ? v.example : '',
          kind,
          lessonId: lesson.id,
          lessonTitle: lesson.title,
          lesson_date: lesson.lesson_date,
        })
      }
    }
    return res.status(200).json({ items })
  } catch (err) {
    return serverError(res, err, 'student/vocabulary')
  }
}
