// POST /api/teacher/students/[id]/sign-in-link → { link }
// One-time sign-in link for an existing, approved student account (lost access,
// expired invitation). Nothing is emailed: the teacher sends it through the Preply chat.
// Never for a teacher or admin account (404), and recorded in the audit log.
import { allowMethods, isBanned, requireTeacher } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { fail, handleError } from '@/utils/api/errors'
import { allowSameOrigin, isUuid } from '@/utils/api/validate'
import { logAdminAction } from '@/utils/api/audit'
import { appOrigin, createSignInLink } from '@/utils/api/invites'
import { getAuthUser, isPendingUser, isStudentUser } from '@/utils/api/students'

const NOT_FOUND = 'Élève introuvable.'

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
    if (isPendingUser(user)) fail('Ce compte attend ton approbation : approuve-le avant de lui envoyer un lien.')
    if (isBanned(user)) fail('Ce compte est suspendu : réactive-le depuis le back office avant de lui envoyer un lien.')
    if (!user.email) fail('Ce compte n’a pas d’adresse e-mail.')

    const link = await createSignInLink(admin, user.email, appOrigin(req))
    // Never the link itself: it signs in as this account
    await logAdminAction(admin, auth.user, {
      action: 'user.sign_in_link',
      entity: 'user',
      entityId: user.id,
      details: { email: user.email, via: 'teacher' },
    })
    return res.status(200).json({ link })
  } catch (err) {
    return handleError(res, err, 'teacher/students/[id]/sign-in-link', 'fr')
  }
}
