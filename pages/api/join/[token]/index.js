// GET /api/join/[token] → { valid: true, label, teacherName }
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

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return
  res.setHeader('Cache-Control', 'private, no-store')
  res.setHeader('Referrer-Policy', 'no-referrer')

  try {
    const admin = createAdminClient()
    const { link, reason, row } = await findUsableLink(admin, req.query.token)
    const name = await teacherName(admin, (link || row)?.created_by)
    if (!link) return res.status(200).json({ valid: false, reason, teacherName: name })
    return res.status(200).json({ valid: true, label: link.label || null, teacherName: name })
  } catch (err) {
    return handleError(res, err, 'join/[token]')
  }
}
