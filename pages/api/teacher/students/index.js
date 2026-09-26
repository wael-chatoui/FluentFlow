// GET /api/teacher/students → { students: [{ id, email, full_name, level, onboarded_at, created_at, lesson_count, last_lesson_date }] }
import { allowMethods, requireTeacher } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { handleError } from '@/utils/api/errors'
import { listTeacherIds } from '@/utils/api/students'

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return
  if (!(await requireTeacher(req, res))) return

  try {
    const admin = createAdminClient()
    const [profiles, lessons, teacherIds] = await Promise.all([
      admin
        .from('profiles')
        .select('id, email, full_name, level, onboarded_at, created_at')
        .order('created_at', { ascending: false }),
      admin.from('lessons').select('student_id, lesson_date'),
      listTeacherIds(admin),
    ])
    for (const r of [profiles, lessons]) if (r.error) throw r.error

    const stats = new Map()
    for (const l of lessons.data || []) {
      const s = stats.get(l.student_id) || { lesson_count: 0, last_lesson_date: null }
      s.lesson_count += 1
      if (!s.last_lesson_date || l.lesson_date > s.last_lesson_date) s.last_lesson_date = l.lesson_date
      stats.set(l.student_id, s)
    }

    const students = (profiles.data || [])
      .filter((p) => !teacherIds.has(p.id))
      .map((p) => ({
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        level: p.level,
        onboarded_at: p.onboarded_at,
        created_at: p.created_at,
        ...(stats.get(p.id) || { lesson_count: 0, last_lesson_date: null }),
      }))

    return res.status(200).json({ students })
  } catch (err) {
    return handleError(res, err, 'teacher/students', 'fr')
  }
}
