// DELETE /api/teacher/join-links/[id] → { joinLink: { id, revoked_at } }
// Revokes a join link that has not been used yet (400 when already used).
// Revoking twice is a no-op. Recorded in the audit log.
import { allowMethods, requireTeacher } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { fail, handleError } from '@/utils/api/errors'
import { allowSameOrigin, isUuid } from '@/utils/api/validate'
import { logAdminAction } from '@/utils/api/audit'

const NOT_FOUND = 'Lien introuvable.'

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['DELETE'])) return
  if (!allowSameOrigin(req, res)) return
  const auth = await requireTeacher(req, res)
  if (!auth) return
  const { id } = req.query
  if (!isUuid(id)) return res.status(404).json({ error: NOT_FOUND })

  try {
    const admin = createAdminClient()
    const { data: link, error } = await admin
      .from('join_links')
      .select('id, label, used_at, revoked_at')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!link) return res.status(404).json({ error: NOT_FOUND })
    if (link.revoked_at) return res.status(200).json({ joinLink: { id: link.id, revoked_at: link.revoked_at } })
    if (link.used_at) fail('Ce lien a déjà été utilisé : il ne peut plus être annulé.')

    const revokedAt = new Date().toISOString()
    const { data: updated, error: updateError } = await admin
      .from('join_links')
      .update({ revoked_at: revokedAt })
      .eq('id', id)
      .is('used_at', null)
      .is('revoked_at', null)
      .select('id, revoked_at')
    if (updateError) throw updateError
    // Used (or revoked) between the read and the write
    if (!updated?.length) fail('Ce lien vient d’être utilisé : il ne peut plus être annulé.')

    await logAdminAction(admin, auth.user, {
      action: 'join_link.revoke',
      entity: 'join_link',
      entityId: id,
      details: { label: link.label || null, via: 'teacher' },
    })
    return res.status(200).json({ joinLink: updated[0] })
  } catch (err) {
    return handleError(res, err, 'teacher/join-links/[id]', 'fr')
  }
}
