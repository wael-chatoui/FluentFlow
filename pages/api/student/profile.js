// PATCH /api/student/profile any of { fullName, level, goals, interests } → { profile }
import { allowMethods, requireUser } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { fail, handleError } from '@/utils/api/errors'
import { bodyOf, parseProfileInput } from '@/utils/api/validate'
import { PROFILE_FIELDS } from '@/utils/supabase/profiles'

function parse(body) {
  const input = parseProfileInput(body, { partial: true })
  const update = {}
  if (input.fullName !== undefined) update.full_name = input.fullName
  if (input.level !== undefined) update.level = input.level
  if (input.goals !== undefined) update.goals = input.goals || null
  if (input.interests !== undefined) update.interests = input.interests || null
  if (!Object.keys(update).length) fail('Nothing to update.')
  return update
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['PATCH'])) return
  const auth = await requireUser(req, res)
  if (!auth) return
  const { user, role } = auth
  if (role === 'teacher') return res.status(403).json({ error: 'This page is for students.' })

  try {
    const update = parse(bodyOf(req))
    const admin = createAdminClient()

    const { data: profile, error } = await admin
      .from('profiles')
      .update(update)
      .eq('id', user.id)
      .select(PROFILE_FIELDS)
      .maybeSingle()
    if (error) throw error
    if (!profile) return res.status(404).json({ error: 'Profile not found.' })

    // Keep the auth display name in sync with the profile (back-office lists and the
    // onboarding prefill fall back to it). Not critical.
    if (update.full_name !== undefined && update.full_name !== user.user_metadata?.full_name) {
      const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
        user_metadata: { ...(user.user_metadata || {}), full_name: update.full_name },
      })
      if (metaError) console.error('[api] student/profile metadata:', metaError)
    }

    return res.status(200).json({ profile })
  } catch (err) {
    return handleError(res, err, 'student/profile')
  }
}
