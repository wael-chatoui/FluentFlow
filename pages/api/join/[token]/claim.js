// POST /api/join/[token]/claim → { ok: true, alreadyClaimed }
// Spends the join link for the signed-in account: what the teacher prepared for the
// placeholder student (lessons, exercises, notes, profile) moves to this account in one
// transaction, the account is approved (role stays student) and the placeholder deleted.
// Works for an account waiting for approval (that is the point). Errors (English):
// 404 unknown, 410 used | expired | revoked, 409 not_student (teacher or admin account).
import { allowMethods, requireUser } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { handleError } from '@/utils/api/errors'
import { allowSameOrigin } from '@/utils/api/validate'
import { logAdminAction } from '@/utils/api/audit'
import { claimJoinLink } from '@/utils/api/joinLinks'

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return
  if (!allowSameOrigin(req, res, 'Request refused: it did not come from the app.')) return
  const auth = await requireUser(req, res, { allowPending: true })
  if (!auth) return

  try {
    const admin = createAdminClient()
    const { link, alreadyClaimed, placeholderId, lessons } = await claimJoinLink(admin, req.query.token, auth.user)
    if (!alreadyClaimed) {
      await logAdminAction(admin, auth.user, {
        action: 'join_link.claim',
        entity: 'join_link',
        entityId: link.id,
        details: { label: link.label || null, email: auth.user.email || null, placeholder_id: placeholderId, lessons, via: 'student' },
      })
    }
    return res.status(200).json({ ok: true, alreadyClaimed })
  } catch (err) {
    return handleError(res, err, 'join/[token]/claim')
  }
}
