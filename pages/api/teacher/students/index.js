// GET /api/teacher/students → { students: [{ id, email, full_name, level, onboarded_at, created_at,
//     lesson_count, last_lesson_date, approved, last_sign_in_at, email_confirmed }] }
// Approved student accounts only: pending self sign-ups are in /api/teacher/overview.
import { allowMethods, requireTeacher } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { handleError } from '@/utils/api/errors'
import { accountFields, authUsersById, isPendingUser, isStudentUser, lessonStatsByStudent, selectAll } from '@/utils/api/students'

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return
  if (!(await requireTeacher(req, res))) return

  try {
    const admin = createAdminClient()
    const [profiles, stats, users] = await Promise.all([
      selectAll(() =>
        admin
          .from('profiles')
          .select('id, email, full_name, level, onboarded_at, created_at')
          .order('created_at', { ascending: false })
          .order('id')
      ),
      lessonStatsByStudent(admin),
      authUsersById(admin),
    ])

    const students = profiles
      .filter((p) => isStudentUser(users.get(p.id)) && !isPendingUser(users.get(p.id)))
      .map((p) => ({
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        level: p.level,
        onboarded_at: p.onboarded_at,
        created_at: p.created_at,
        ...(stats.get(p.id) || { lesson_count: 0, last_lesson_date: null }),
        ...accountFields(users.get(p.id)),
      }))

    return res.status(200).json({ students })
  } catch (err) {
    return handleError(res, err, 'teacher/students', 'fr')
  }
}
