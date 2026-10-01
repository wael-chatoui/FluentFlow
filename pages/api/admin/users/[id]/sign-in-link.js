// POST /api/admin/users/[id]/sign-in-link {} → { link }
// One-time sign-in link for an existing account (invitation lost or expired, lost
// access), to send yourself (e.g. through the Preply chat). Nothing is emailed.
// Refused for your own account and for other administrators (no admin impersonation),
// for suspended accounts, accounts waiting for approval and placeholder students.
import { allowMethods, isAdmin, isApproved, isBanned, isPlaceholder, normalizeUuid, requireAdmin } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { fail, handleError } from '@/utils/api/errors'
import { isUuid } from '@/utils/api/validate'
import { appOrigin, createSignInLink } from '@/utils/api/invites'
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
    if (id === normalizeUuid(auth.user.id)) fail('Pour ton propre compte, utilise la page de connexion.')
    const admin = createAdminClient()
    const user = await getAuthUser(admin, id)
    if (!user) return res.status(404).json({ error: NOT_FOUND })
    if (isAdmin(user)) fail('Pas de lien de connexion pour un compte administrateur : il se connecte lui-même depuis la page de connexion.')
    if (isPlaceholder(user)) fail('Compte provisoire (invitation en attente) : il n’a pas de vraie adresse. Crée un nouveau lien d’invitation depuis la fiche de l’élève.')
    if (!isApproved(user)) fail('Ce compte attend ton approbation : approuve-le avant de lui envoyer un lien.')
    if (isBanned(user)) fail('Ce compte est banni : débannis-le avant de lui envoyer un lien.')
    if (!user.email) fail('Ce compte n’a pas d’adresse e-mail.')

    const link = await createSignInLink(admin, user.email, appOrigin(req))
    // Never the link itself: it signs in as this account
    await logAdminAction(admin, auth.user, {
      action: 'user.sign_in_link',
      entity: 'user',
      entityId: id,
      details: { email: user.email },
    })
    return res.status(200).json({ link })
  } catch (err) {
    return handleError(res, err, 'admin/users/[id]/sign-in-link', 'fr')
  }
}
