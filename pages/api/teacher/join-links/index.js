// POST /api/teacher/join-links { label } → 201 { link, message, studentId,
//     joinLink: { id, label, student_id, expires_at } }
//   One-time invitation link that needs no email address (utils/api/joinLinks.js). The
//   student's first name is required: a placeholder student account (studentId) is created
//   right away, so the teacher can open /teacher/students/<studentId>, import lessons and
//   create exercises before the student joins. The teacher pastes the link or the message
//   (English, for the student) in the Preply chat. The token is only in this answer: the
//   database keeps its SHA-256.
// GET /api/teacher/join-links → { joinLinks: [{ id, label, created_at, expires_at, used_at,
//     revoked_at, status: 'active'|'used'|'expired'|'revoked', student_id,
//     used_by: { id, name, email }|null }] }
//   The 20 most recent links.
import { allowMethods, requireTeacher } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { fail, handleError } from '@/utils/api/errors'
import { allowSameOrigin, bodyOf, optionalText } from '@/utils/api/validate'
import { logAdminAction } from '@/utils/api/audit'
import { appOrigin } from '@/utils/api/invites'
import { JOIN_LABEL_MAX, createJoinLink, joinLinkStatus, joinMessage, teacherFirstName } from '@/utils/api/joinLinks'

const LIST_LIMIT = 20

async function list(admin, res) {
  const { data: rows, error } = await admin
    .from('join_links')
    .select('id, label, student_id, created_at, expires_at, used_at, used_by, revoked_at')
    .order('created_at', { ascending: false })
    .limit(LIST_LIMIT)
  if (error) throw error

  const userIds = [...new Set(rows.map((r) => r.used_by).filter(Boolean))]
  const profiles = new Map()
  if (userIds.length) {
    const { data, error: profileError } = await admin.from('profiles').select('id, full_name, email').in('id', userIds)
    if (profileError) throw profileError
    for (const p of data || []) profiles.set(p.id, p)
  }

  const now = Date.now()
  res.setHeader('Cache-Control', 'private, no-store')
  return res.status(200).json({
    joinLinks: rows.map((r) => {
      const who = r.used_by ? profiles.get(r.used_by) : null
      return {
        id: r.id,
        label: r.label,
        created_at: r.created_at,
        expires_at: r.expires_at,
        used_at: r.used_at,
        revoked_at: r.revoked_at,
        status: joinLinkStatus(r, now),
        student_id: r.student_id || null,
        used_by: r.used_by ? { id: r.used_by, name: who?.full_name || null, email: who?.email || null } : null,
      }
    }),
  })
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return
  if (req.method === 'POST' && !allowSameOrigin(req, res)) return
  const auth = await requireTeacher(req, res)
  if (!auth) return

  try {
    const admin = createAdminClient()
    if (req.method === 'GET') return await list(admin, res)

    const label = optionalText(bodyOf(req).label, JOIN_LABEL_MAX, `Le prénom doit faire au plus ${JOIN_LABEL_MAX} caractères.`)
    if (!label) fail('Indique le prénom de l’élève.')
    const origin = appOrigin(req)
    // Placeholder account first, then the link (a failed link insert removes the account)
    const [{ link, row, studentId }, teacherName] = await Promise.all([
      createJoinLink(admin, { label, createdBy: auth.user.id, origin }),
      teacherFirstName(admin, auth.user.id),
    ])
    // Never the link itself: anyone holding it can join
    await logAdminAction(admin, auth.user, {
      action: 'join_link.create',
      entity: 'join_link',
      entityId: row.id,
      details: { label, student_id: studentId, expires_at: row.expires_at, via: 'teacher' },
    })
    return res.status(201).json({
      link,
      message: joinMessage({ label, link, teacherName }),
      studentId,
      joinLink: { id: row.id, label: row.label, student_id: studentId, expires_at: row.expires_at },
    })
  } catch (err) {
    return handleError(res, err, 'teacher/join-links', 'fr')
  }
}
