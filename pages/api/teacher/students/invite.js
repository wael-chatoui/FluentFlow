// POST /api/teacher/students/invite { email, fullName?, sendEmail? = false }
//      → 201 { student: { id, email, full_name }, link: string|null }
// Creates an approved student account. Without sendEmail the teacher gets a one-time
// link to send through the Preply chat; with sendEmail Supabase emails the invitation
// (link: null). 409 { code: 'email_exists' } when the address already has an account,
// confirmed or not (it is left untouched: use « Nouveau lien de connexion » for a student).
// Recorded in the audit log.
import { allowMethods, requireTeacher } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { handleError } from '@/utils/api/errors'
import { LIMITS, allowSameOrigin, bodyOf, optionalBoolean, optionalText } from '@/utils/api/validate'
import { logAdminAction } from '@/utils/api/audit'
import { appOrigin, inviteUser, parseEmail } from '@/utils/api/invites'

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return
  if (!allowSameOrigin(req, res)) return
  const auth = await requireTeacher(req, res)
  if (!auth) return

  try {
    const body = bodyOf(req)
    const email = parseEmail(body.email)
    const fullName = optionalText(body.fullName, LIMITS.fullName, `Le nom doit faire au plus ${LIMITS.fullName} caractères.`) || ''
    const sendEmail = optionalBoolean(body.sendEmail, 'Le champ « envoyer par e-mail » est invalide.') === true

    const admin = createAdminClient()
    const { user, link } = await inviteUser(admin, { email, fullName, role: 'student', sendEmail, origin: appOrigin(req) })
    // Never the link itself: it signs in as this account
    await logAdminAction(admin, auth.user, {
      action: 'user.invite',
      entity: 'user',
      entityId: user.id,
      details: { email, role: 'student', is_admin: false, full_name: fullName || null, delivery: sendEmail ? 'email' : 'link', via: 'teacher' },
    })
    return res.status(201).json({ student: { id: user.id, email: user.email || email, full_name: fullName || null }, link })
  } catch (err) {
    return handleError(res, err, 'teacher/students/invite', 'fr')
  }
}
