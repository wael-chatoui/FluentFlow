// GET /api/me → { user: { id, email }, role, approved, isAdmin, profile }
// Also answers for accounts waiting for approval, so /pending can check its status.
import { allowMethods, isAdmin, isApproved, requireUser } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { PROFILE_FIELDS } from '@/utils/supabase/profiles'
import { handleError } from '@/utils/api/errors'

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return
  const auth = await requireUser(req, res, { allowPending: true })
  if (!auth) return
  const { user, role } = auth

  try {
    const { data: profile, error } = await createAdminClient()
      .from('profiles')
      .select(PROFILE_FIELDS)
      .eq('id', user.id)
      .maybeSingle()
    if (error) throw error

    res.setHeader('Cache-Control', 'private, no-store')
    return res.status(200).json({
      user: { id: user.id, email: user.email },
      role,
      approved: isApproved(user),
      isAdmin: isAdmin(user),
      profile: profile || null,
    })
  } catch (err) {
    return handleError(res, err, 'me')
  }
}
