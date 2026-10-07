// GET  /api/admin/users?q=&role=all|student|teacher|admin|pending&sort=&dir=asc|desc&page=&perPage=
//      → { users, total, page, perPage } (default: newest first; a page past the end returns the last page)
// POST /api/admin/users { email, fullName?, role, isAdmin?, sendEmail? } → 201 { user, link }
//      Creates an approved account. Without sendEmail, `link` is a one-time sign-in link to
//      send yourself; with sendEmail Supabase emails the invitation (link: null).
import { allowMethods, requireAdmin } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { fail, handleError } from '@/utils/api/errors'
import { LIMITS, bodyOf, optionalBoolean, optionalText } from '@/utils/api/validate'
import { appOrigin, inviteUser, parseEmail } from '@/utils/api/invites'
import { logAdminAction } from '@/utils/api/audit'
import { lastPage, parsePagination, queryEnum, queryText, selectAll } from '@/utils/api/admin/query'
import { assertJsonBody } from '@/utils/api/admin/guard'
import {
  COUNT_SORTS,
  USER_SORTS,
  listAllAuthUsers,
  matchesQuery,
  matchesRole,
  sortUserItems,
  userListItem,
} from '@/utils/api/admin/users'

const ROLES = ['student', 'teacher']

function countBy(rows, key) {
  const map = new Map()
  for (const r of rows) map.set(r[key], (map.get(r[key]) || 0) + 1)
  return map
}

// Lessons and practice sessions per account: for `ids`, or for everyone when ids is null
async function activityCounts(admin, ids) {
  if (ids && !ids.length) return { lessons: new Map(), sessions: new Map() }
  const rows = (table) =>
    selectAll(() => {
      const request = admin.from(table).select('student_id')
      return (ids ? request.in('student_id', ids) : request).order('id')
    })
  const [lessons, sessions] = await Promise.all([rows('lessons'), rows('practice_sessions')])
  return { lessons: countBy(lessons, 'student_id'), sessions: countBy(sessions, 'student_id') }
}

async function userSubscriptions(admin, userIds) {
  if (!userIds.length) return new Map()
  try {
    const { data, error } = await admin
      .from('subscriptions')
      .select('user_id, status, plan, provider, amount_cents')
      .in('user_id', userIds)
      .order('created_at', { ascending: false })
    if (error) throw error
    const map = new Map()
    for (const s of data || []) {
      if (!map.has(s.user_id)) map.set(s.user_id, s)
    }
    return map
  } catch {
    return new Map()
  }
}

async function userAiCosts(admin, userIds) {
  if (!userIds.length) return new Map()
  const map = new Map()
  try {
    const { data, error } = await admin
      .from('ai_generations')
      .select('student_id, prompt_tokens, completion_tokens, cost_usd')
      .in('student_id', userIds)
    if (error) throw error
    for (const g of data || []) {
      const id = g.student_id
      if (!id) continue
      let cost = g.cost_usd !== null && g.cost_usd !== undefined ? Number(g.cost_usd) : null
      if (cost === null) {
        const p = Number(g.prompt_tokens) || 0
        const c = Number(g.completion_tokens) || 0
        cost = (p * 0.05 + c * 0.4) / 1e6
      }
      map.set(id, (map.get(id) || 0) + cost)
    }
    for (const [id, val] of map.entries()) {
      map.set(id, Math.round(val * 1_000_000) / 1_000_000)
    }
    return map
  } catch {
    return map
  }
}

async function listUsers(admin, query) {
  const q = queryText(query.q)
  const role = queryEnum(query.role, ['all', ...ROLES, 'admin', 'pending'], 'all', 'Filtre de rôle invalide.')
  const sort = queryEnum(query.sort, USER_SORTS, 'created_at', 'Colonne de tri inconnue.')
  const dir = queryEnum(query.dir, ['asc', 'desc'], sort === 'created_at' ? 'desc' : 'asc', 'Ordre de tri invalide (asc ou desc).')
  const { page, perPage } = parsePagination(query)

  const [authUsers, profiles] = await Promise.all([
    listAllAuthUsers(admin),
    selectAll(() => admin.from('profiles').select('id, email, full_name, level, onboarded_at, created_at').order('id')),
  ])
  const profileById = new Map(profiles.map((p) => [p.id, p]))
  const matching = authUsers.filter((u) => matchesRole(u, role) && matchesQuery(u, profileById.get(u.id), q))

  // Sorting by a count needs the counts of every match; otherwise only the page's
  const countAll = COUNT_SORTS.includes(sort)
  const allCounts = countAll ? await activityCounts(admin, null) : null
  const items = matching.map((u) =>
    userListItem(u, profileById.get(u.id), allCounts ? { lessons: allCounts.lessons.get(u.id), sessions: allCounts.sessions.get(u.id) } : {})
  )
  const sorted = sortUserItems(items, sort, dir)

  const current = Math.min(page, lastPage(sorted.length, perPage))
  const pageItems = sorted.slice((current - 1) * perPage, current * perPage)
  const userIds = pageItems.map((u) => u.id)

  const [counts, subsMap, aiCostsMap] = await Promise.all([
    countAll ? Promise.resolve(null) : activityCounts(admin, userIds),
    userSubscriptions(admin, userIds),
    userAiCosts(admin, userIds),
  ])

  for (const item of pageItems) {
    if (counts) {
      item.lesson_count = counts.lessons.get(item.id) || 0
      item.session_count = counts.sessions.get(item.id) || 0
    }
    const sub = subsMap.get(item.id)
    item.subscription_status = sub ? sub.status : 'none'
    item.subscription = sub || null
    item.ai_cost_usd = aiCostsMap.get(item.id) ?? null
  }
  return { users: pageItems, total: sorted.length, page: current, perPage }
}

function parseInvite(body) {
  const email = parseEmail(body.email)
  const fullName = optionalText(body.fullName, LIMITS.fullName, `Le nom doit faire au plus ${LIMITS.fullName} caractères.`)
  if (!ROLES.includes(body.role)) fail('Rôle invalide (student ou teacher).')
  const isAdmin = optionalBoolean(body.isAdmin, 'isAdmin doit être un booléen.')
  const sendEmail = optionalBoolean(body.sendEmail, 'Le champ « envoyer par e-mail » doit être un booléen.')
  return { email, fullName: fullName || '', role: body.role, isAdmin: isAdmin === true, sendEmail: sendEmail === true }
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return
  const auth = await requireAdmin(req, res)
  if (!auth) return

  try {
    const admin = createAdminClient()
    if (req.method === 'GET') return res.status(200).json(await listUsers(admin, req.query || {}))

    assertJsonBody(req)
    const input = parseInvite(bodyOf(req))
    const { user, link } = await inviteUser(admin, { ...input, origin: appOrigin(req) })
    // Never the link itself: it signs in as this account
    await logAdminAction(admin, auth.user, {
      action: 'user.invite',
      entity: 'user',
      entityId: user.id,
      details: {
        email: input.email,
        role: input.role,
        is_admin: input.isAdmin,
        full_name: input.fullName || null,
        delivery: input.sendEmail ? 'email' : 'link',
      },
    })
    const profile = { email: input.email, full_name: input.fullName || null }
    return res.status(201).json({ user: userListItem(user, profile), link })
  } catch (err) {
    return handleError(res, err, `admin/users ${req.method}`, 'fr')
  }
}
