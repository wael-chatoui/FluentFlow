// POST /api/student/deleteProfile → { success: true }
// Deletes the student's auth user; profile, lessons and practice cascade.
import { allowMethods, requireUser, serverError } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return
  const auth = await requireUser(req, res)
  if (!auth) return
  if (auth.role === 'teacher') return res.status(403).json({ error: 'Teacher accounts cannot be deleted here.' })

  try {
    const { error } = await createAdminClient().auth.admin.deleteUser(auth.user.id)
    if (error) throw error
    return res.status(200).json({ success: true })
  } catch (err) {
    return serverError(res, err, 'student/deleteProfile')
  }
}
