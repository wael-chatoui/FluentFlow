// POST /api/onboarding/complete { fullName, level, goals, interests } → { profile }
import { allowMethods, requireUser } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { handleError } from '@/utils/api/errors'
import { bodyOf, parseProfileInput } from '@/utils/api/validate'

const PROFILE_FIELDS = 'id, email, full_name, level, goals, interests, drive_folder_url, onboarded_at, created_at, updated_at'

function parse(body) {
  const { fullName, level, goals, interests } = parseProfileInput(body)
  return { fullName, level, goals: goals || null, interests: interests || null }
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return
  const auth = await requireUser(req, res)
  if (!auth) return
  const { user, role } = auth
  if (role === 'teacher') return res.status(403).json({ error: 'Onboarding is for students only.' })

  try {
    const input = parse(bodyOf(req))
    const admin = createAdminClient()

    const { data: profile, error } = await admin
      .from('profiles')
      .upsert(
        {
          id: user.id,
          email: user.email,
          full_name: input.fullName,
          level: input.level,
          goals: input.goals,
          interests: input.interests,
          onboarded_at: new Date().toISOString(),
        },
        { onConflict: 'id' }
      )
      .select(PROFILE_FIELDS)
      .single()
    if (error) throw error

    // Keep the auth display name in sync (shown in the header). Not critical.
    const { error: metaError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: { ...(user.user_metadata || {}), full_name: input.fullName },
    })
    if (metaError) console.error('[api] onboarding/complete metadata:', metaError)

    return res.status(200).json({ profile })
  } catch (err) {
    return handleError(res, err, 'onboarding/complete')
  }
}
