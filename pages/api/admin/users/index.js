// GET  /api/admin/users?q=&role=all|student|teacher|admin&page=&perPage= → { users, total, page, perPage }
// POST /api/admin/users { email, fullName?, role, isAdmin? } → 201 { user } (sends a Supabase invitation)
import { allowMethods, requireAdmin } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { fail, handleError } from '@/utils/api/errors'
import { LIMITS, bodyOf, optionalText } from '@/utils/api/validate'
import { logAdminAction } from '@/utils/api/audit'
import { parsePagination, queryEnum, queryText, selectAll } from '@/utils/api/admin/query'
import {
  byNewest,
  listAllAuthUsers,
  matchesQuery,
  matchesRole,
  requestOrigin,
  userListItem,
} from '@/utils/api/admin/users'

const ROLES = ['student', 'teacher']
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function countBy(rows, key) {
  const map = new Map()
  for (const r of rows) map.set(r[key], (map.get(r[key]) || 0) + 1)
  return map
}

async function listUsers(admin, query) {
  const q = queryText(query.q)
  const role = queryEnum(query.role, ['all', ...ROLES, 'admin'], 'all', 'Filtre de rôle invalide.')
  const { page, perPage, from } = parsePagination(query)

  const [authUsers, profiles] = await Promise.all([
    listAllAuthUsers(admin),
    selectAll(() => admin.from('profiles').select('id, email, full_name, level, onboarded_at, created_at').order('id')),
  ])
  const profileById = new Map(profiles.map((p) => [p.id, p]))

  const matching = authUsers
    .filter((u) => matchesRole(u, role) && matchesQuery(u, profileById.get(u.id), q))
    .sort(byNewest)
  const pageUsers = matching.slice(from, from + perPage)
  const ids = pageUsers.map((u) => u.id)

  let lessons = []
  let sessions = []
  if (ids.length) {
    ;[lessons, sessions] = await Promise.all([
      selectAll(() => admin.from('lessons').select('student_id').in('student_id', ids).order('id')),
      selectAll(() => admin.from('practice_sessions').select('student_id').in('student_id', ids).order('id')),
    ])
  }
  const lessonCounts = countBy(lessons, 'student_id')
  const sessionCounts = countBy(sessions, 'student_id')

  return {
    users: pageUsers.map((u) =>
      userListItem(u, profileById.get(u.id), { lessons: lessonCounts.get(u.id), sessions: sessionCounts.get(u.id) })
    ),
    total: matching.length,
    page,
    perPage,
  }
}

function parseInvite(body) {
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) fail('Adresse e-mail invalide.')
  const fullName = optionalText(body.fullName, LIMITS.fullName, `Le nom doit faire au plus ${LIMITS.fullName} caractères.`)
  if (!ROLES.includes(body.role)) fail('Rôle invalide (student ou teacher).')
  if (body.isAdmin !== undefined && typeof body.isAdmin !== 'boolean') fail('isAdmin doit être un booléen.')
  return { email, fullName: fullName || '', role: body.role, isAdmin: body.isAdmin === true }
}

const alreadyExists = (error) =>
  error?.code === 'email_exists' || error?.status === 422 || /already (been )?registered|already exists/i.test(error?.message || '')

async function inviteUser(admin, req, input) {
  const { data, error } = await admin.auth.admin.inviteUserByEmail(input.email, {
    redirectTo: `${requestOrigin(req)}/auth/callback`,
    data: input.fullName ? { full_name: input.fullName } : {},
  })
  if (error) {
    if (alreadyExists(error)) fail('Un compte existe déjà avec cette adresse e-mail.')
    throw error
  }
  const invited = data?.user
  if (!invited?.id) throw new Error('inviteUserByEmail returned no user')

  const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(invited.id, {
    app_metadata: { ...(invited.app_metadata || {}), role: input.role, is_admin: input.isAdmin },
  })
  if (updateError) {
    // Do not leave an account with the wrong role behind
    await admin.auth.admin.deleteUser(invited.id).catch(() => {})
    throw updateError
  }
  const user = updated?.user || {
    ...invited,
    app_metadata: { ...(invited.app_metadata || {}), role: input.role, is_admin: input.isAdmin },
  }

  // The DB trigger creates the profile; make sure it exists either way
  const { error: profileError } = await admin
    .from('profiles')
    .upsert({ id: user.id, email: input.email, full_name: input.fullName || null }, { onConflict: 'id', ignoreDuplicates: true })
  if (profileError) console.error('[api] admin/users POST profile:', profileError)
  const { data: profile } = await admin
    .from('profiles')
    .select('id, email, full_name, level, onboarded_at, created_at')
    .eq('id', user.id)
    .maybeSingle()

  return userListItem(user, profile || { email: input.email, full_name: input.fullName || null })
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return
  const auth = await requireAdmin(req, res)
  if (!auth) return

  try {
    const admin = createAdminClient()
    if (req.method === 'GET') return res.status(200).json(await listUsers(admin, req.query || {}))

    const input = parseInvite(bodyOf(req))
    const user = await inviteUser(admin, req, input)
    await logAdminAction(admin, auth.user, {
      action: 'user.invite',
      entity: 'user',
      entityId: user.id,
      details: { email: input.email, role: input.role, is_admin: input.isAdmin, full_name: input.fullName || null },
    })
    return res.status(201).json({ user })
  } catch (err) {
    return handleError(res, err, `admin/users ${req.method}`, 'fr')
  }
}
