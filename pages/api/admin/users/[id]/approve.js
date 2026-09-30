// POST /api/admin/users/[id]/approve {} → { success: true }
// Approves an account created by self sign-up (app_metadata.approved === false, else 400).
// To refuse one, delete the account.
import { allowMethods, isApproved, normalizeUuid, requireAdmin } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { fail, handleError } from '@/utils/api/errors'
import { isUuid } from '@/utils/api/validate'
import { approveUser } from '@/utils/api/invites'
import { logAdminAction } from '@/utils/api/audit'
import { assertJsonBody } from '@/utils/api/admin/guard'
import { getAuthUser } from '@/utils/api/admin/users'

const NOT_FOUND = 'Utilisateur introuvable.'

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return
  const auth = await requireAdmin(req, res)
  if (!auth) return
  if (!isUuid(req.query.id)) return res.status(404).json({ error: NOT_FOUND })
  const id = normalizeUuid(req.query.id)

  try {
    assertJsonBody(req)
    const admin = createAdminClient()
    const user = await getAuthUser(admin, id)
    if (!user) return res.status(404).json({ error: NOT_FOUND })
    if (isApproved(user)) fail('Ce compte est déjà approuvé.')

    await approveUser(admin, user)
    await logAdminAction(admin, auth.user, { action: 'user.approve', entity: 'user', entityId: id, details: { email: user.email || null } })
    return res.status(200).json({ success: true })
  } catch (err) {
    return handleError(res, err, 'admin/users/[id]/approve', 'fr')
  }
}
