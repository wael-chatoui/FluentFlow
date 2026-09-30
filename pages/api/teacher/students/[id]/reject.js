// POST /api/teacher/students/[id]/reject → { success: true }
// Refuses an account created by self sign-up: the account is deleted (pending only,
// else 400; approved students are deleted from the back office).
import { allowMethods, requireTeacher } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { fail, handleError } from '@/utils/api/errors'
import { allowSameOrigin, isUuid } from '@/utils/api/validate'
import { logAdminAction } from '@/utils/api/audit'
import { getAuthUser, isPendingUser, isStudentUser } from '@/utils/api/students'

const NOT_FOUND = 'Compte introuvable.'

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return
  if (!allowSameOrigin(req, res)) return
  const auth = await requireTeacher(req, res)
  if (!auth) return
  const { id } = req.query
  if (!isUuid(id)) return res.status(404).json({ error: NOT_FOUND })

  try {
    const admin = createAdminClient()
    const user = await getAuthUser(admin, id)
    if (!isStudentUser(user)) return res.status(404).json({ error: NOT_FOUND })
    if (!isPendingUser(user)) fail('Seul un compte en attente peut être refusé.')

    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) throw error
    await logAdminAction(admin, auth.user, {
      action: 'user.delete',
      entity: 'user',
      entityId: user.id,
      details: { email: user.email || null, reason: 'pending_rejected', via: 'teacher' },
    })
    return res.status(200).json({ success: true })
  } catch (err) {
    return handleError(res, err, 'teacher/students/[id]/reject', 'fr')
  }
}
