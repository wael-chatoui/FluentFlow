// POST /api/teacher/students/[id]/join-link → 201 { link, message, joinLink: { id, label, student_id, expires_at } }
// « Nouveau lien d'invitation » for a placeholder student (created with a join link, not
// joined yet): creates a new link for the same placeholder and revokes its other unused ones,
// so what was prepared for it still goes to the student. 404 for anything else (a real
// account signs in with « Copier un lien de connexion »). Recorded in the audit log.
import { allowMethods, isPlaceholder, requireTeacher } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { handleError } from '@/utils/api/errors'
import { allowSameOrigin, isUuid } from '@/utils/api/validate'
import { logAdminAction } from '@/utils/api/audit'
import { appOrigin } from '@/utils/api/invites'
import { getAuthUser, isStudentUser } from '@/utils/api/students'
import { createJoinLink, joinMessage, revokeLinksOf, teacherFirstName } from '@/utils/api/joinLinks'

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
    if (!isStudentUser(user) || !isPlaceholder(user)) return res.status(404).json({ error: NOT_FOUND })

    const { data: profile, error } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    if (error) throw error
    const label = (profile?.full_name || user.user_metadata?.full_name || '').trim() || 'Élève'

    const [{ link, row }, teacherName] = await Promise.all([
      createJoinLink(admin, { label, studentId: user.id, createdBy: auth.user.id, origin: appOrigin(req) }),
      teacherFirstName(admin, auth.user.id),
    ])
    // Only one link works at a time: the previous ones stop working
    const revoked = await revokeLinksOf(admin, user.id, { exceptId: row.id })
    // Never the link itself: anyone holding it can join
    await logAdminAction(admin, auth.user, {
      action: 'join_link.create',
      entity: 'join_link',
      entityId: row.id,
      details: { label, student_id: user.id, revoked, expires_at: row.expires_at, via: 'teacher' },
    })
    return res.status(201).json({
      link,
      message: joinMessage({ label, link, teacherName }),
      joinLink: { id: row.id, label: row.label, student_id: user.id, expires_at: row.expires_at },
    })
  } catch (err) {
    return handleError(res, err, 'teacher/students/[id]/join-link', 'fr')
  }
}
