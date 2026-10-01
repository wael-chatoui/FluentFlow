// GET /api/join/[token] → { valid: true, label, teacherName }  label: the placeholder's
//                         first name (as the teacher may have corrected it), else the link's
//                       | { valid: false, reason: 'unknown'|'used'|'expired'|'revoked', teacherName }
// Public (no sign-in): the /join page shows who invited the student before sign-in.
// The token is 256 random bits, so it cannot be guessed; only its hash is looked up.
import { allowMethods } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { handleError } from '@/utils/api/errors'
import { findUsableLink } from '@/utils/api/joinLinks'

const DEFAULT_TEACHER = 'Wael'

async function teacherName(admin, userId) {
  if (!userId) return DEFAULT_TEACHER
  const { data } = await admin.from('profiles').select('full_name').eq('id', userId).maybeSingle()
  return (data?.full_name || '').trim().split(/\s+/)[0] || DEFAULT_TEACHER
}

// First name of the placeholder student the link was made for (null when none)
async function placeholderFirstName(admin, studentId) {
  if (!studentId) return null
  const { data } = await admin.from('profiles').select('full_name').eq('id', studentId).maybeSingle()
  return (data?.full_name || '').trim().split(/\s+/)[0] || null
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')

  try {
    const admin = createAdminClient()
    const { link, reason, row } = await findUsableLink(admin, req.query.token)
    const name = await teacherName(admin, (link || row)?.created_by)
    if (!link) return res.status(200).json({ valid: false, reason, teacherName: name })
    const label = (await placeholderFirstName(admin, link.student_id)) || link.label || null
    return res.status(200).json({ valid: true, label, teacherName: name })
  } catch (err) {
    return handleError(res, err, 'join/[token]')
  }
}
