// POST /api/student/deleteProfile → { success: true }
// Deletes the student's auth user; profile, notes, lessons, practice and reviews cascade.
// Students only: teachers and back-office admins get 403 (their accounts are managed in
// the back office, which never removes the last teacher or admin), accounts waiting for
// approval get 403 { code: 'pending' } (the teacher refuses them instead).
import { allowMethods, isAdmin, requireUser } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { handleError } from '@/utils/api/errors'

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return
  const auth = await requireUser(req, res)
  if (!auth) return
  if (auth.role === 'teacher' || isAdmin(auth.user)) {
    return res.status(403).json({ error: 'This account cannot be deleted here.' })
  }

  try {
    const { error } = await createAdminClient().auth.admin.deleteUser(auth.user.id)
    if (error) throw error
    return res.status(200).json({ success: true })
  } catch (err) {
    return handleError(res, err, 'student/deleteProfile')
  }
}
