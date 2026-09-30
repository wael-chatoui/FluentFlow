// POST /api/teacher/students/[id]/approve → { student: { id, email, full_name, approved: true } }
// Approves an account created by self sign-up (pending only, else 400).
import { allowMethods, requireTeacher } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { fail, handleError } from '@/utils/api/errors'
import { allowSameOrigin, isUuid } from '@/utils/api/validate'
import { logAdminAction } from '@/utils/api/audit'
import { approveUser } from '@/utils/api/invites'
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
    if (!isPendingUser(user)) fail('Ce compte est déjà approuvé.')

    await approveUser(admin, user)
    await logAdminAction(admin, auth.user, {
      action: 'user.approve',
      entity: 'user',
      entityId: user.id,
      details: { email: user.email || null, via: 'teacher' },
    })
    const { data: profile, error } = await admin.from('profiles').select('full_name, email').eq('id', user.id).maybeSingle()
    if (error) throw error
    return res.status(200).json({
      student: {
        id: user.id,
        email: user.email || profile?.email || '',
        full_name: profile?.full_name || user.user_metadata?.full_name || null,
        approved: true,
      },
    })
  } catch (err) {
    return handleError(res, err, 'teacher/students/[id]/approve', 'fr')
  }
}
