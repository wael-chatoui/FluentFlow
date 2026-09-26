// GET /api/me → { user: { id, email }, role, profile }
import { allowMethods, requireUser, serverError } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'

const PROFILE_FIELDS = 'id, email, full_name, level, goals, interests, drive_folder_url, onboarded_at, created_at, updated_at'

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return
  const auth = await requireUser(req, res)
  if (!auth) return
  const { user, role } = auth

  try {
    const { data: profile, error } = await createAdminClient()
      .from('profiles')
      .select(PROFILE_FIELDS)
      .eq('id', user.id)
      .maybeSingle()
    if (error) throw error

    return res.status(200).json({ user: { id: user.id, email: user.email }, role, profile: profile || null })
  } catch (err) {
    return serverError(res, err, 'me')
  }
}
