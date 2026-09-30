// Auth users for the back office: listing every account (Auth admin API), merging
// with profiles, the documented user shapes, sorting and the privilege safety rules.
import { fail } from '@/utils/api/errors'
import { getRole, isAdmin, isApproved, isBanned, normalizeUuid } from '@/utils/auth/server'

const AUTH_PAGE = 1000
export const MAX_USERS = 10_000

/** Every auth user (up to MAX_USERS), page by page. */
export async function listAllAuthUsers(admin) {
  const users = []
  for (let page = 1; users.length < MAX_USERS; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: AUTH_PAGE })
    if (error) throw error
    const batch = data?.users || []
    users.push(...batch)
    if (batch.length < AUTH_PAGE) return users
  }
  console.warn(`[admin] listAllAuthUsers stopped at ${MAX_USERS} accounts: totals may be incomplete`)
  return users.slice(0, MAX_USERS)
}

/** Number of auth accounts: one small request (the Auth API sends the total), full list as a fallback. */
export async function countAuthUsers(admin) {
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 })
  if (error) throw error
  if (data?.total > 0 || !data?.users?.length) return data?.total || 0
  return (await listAllAuthUsers(admin)).length
}

/** Auth user by id, or null when it does not exist. */
export async function getAuthUser(admin, id) {
  const { data, error } = await admin.auth.admin.getUserById(id)
  if (error && error.status !== 404 && !/not.?found/i.test(error.message || '')) throw error
  return data?.user || null
}

export function providersOf(user) {
  const fromMeta = user?.app_metadata?.providers
  const list = Array.isArray(fromMeta) && fromMeta.length
    ? fromMeta
    : (user?.identities || []).map((i) => i?.provider)
  return [...new Set(list.filter((p) => typeof p === 'string' && p))]
}

/**
 * Display name: the profile's once a profile row exists (it is the source of truth,
 * the DB trigger copies the sign-up name into it), else the sign-up metadata.
 */
export function nameOf(user, profile) {
  if (profile) return profile.full_name || null
  return user?.user_metadata?.full_name || user?.user_metadata?.name || null
}

/**
 * Access state of an account:
 * - approved: false for a self sign-up waiting for approval (app_metadata.approved === false)
 * - invite_pending: approved, but never signed in or email never confirmed (invitation not used yet)
 */
export function accessState(user) {
  const approved = isApproved(user)
  const emailConfirmed = Boolean(user?.email_confirmed_at || user?.confirmed_at)
  return {
    approved,
    email_confirmed: emailConfirmed,
    invite_pending: approved && (!user?.last_sign_in_at || !emailConfirmed),
  }
}

/** 'all' | 'student' | 'teacher' | 'admin' | 'pending' (waiting for approval) filter. */
export function matchesRole(user, role) {
  if (!role || role === 'all') return true
  if (role === 'admin') return isAdmin(user)
  if (role === 'pending') return !isApproved(user)
  return getRole(user) === role
}

/** { id, email, created_at, last_sign_in_at, invited_at, role, is_admin, banned, approved, email_confirmed, invite_pending, providers } */
export function authSummary(user) {
  return {
    id: user.id,
    email: user.email || '',
    created_at: user.created_at || null,
    last_sign_in_at: user.last_sign_in_at || null,
    invited_at: user.invited_at || null,
    role: getRole(user),
    is_admin: isAdmin(user),
    banned: isBanned(user),
    ...accessState(user),
    providers: providersOf(user),
  }
}

/**
 * List item: { id, email, full_name, role, is_admin, level, onboarded_at, created_at,
 * last_sign_in_at, banned, approved, email_confirmed, invite_pending, lesson_count, session_count }
 */
export function userListItem(user, profile, counts = {}) {
  return {
    id: user.id,
    email: user.email || profile?.email || '',
    full_name: nameOf(user, profile),
    role: getRole(user),
    is_admin: isAdmin(user),
    level: profile?.level || null,
    onboarded_at: profile?.onboarded_at || null,
    created_at: user.created_at || profile?.created_at || null,
    last_sign_in_at: user.last_sign_in_at || null,
    banned: isBanned(user),
    ...accessState(user),
    lesson_count: counts.lessons || 0,
    session_count: counts.sessions || 0,
  }
}

/** Case-insensitive substring match on email and display name. */
export function matchesQuery(user, profile, q) {
  if (!q) return true
  const needle = q.toLowerCase()
  const name = nameOf(user, profile) || ''
  return (user.email || '').toLowerCase().includes(needle) || name.toLowerCase().includes(needle)
}

export const byNewest = (a, b) => (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0)

// Sort keys of GET /api/admin/users (values read from list items)
const SORT_VALUE = {
  full_name: (r) => (r.full_name || r.email || '').toLocaleLowerCase('fr'),
  email: (r) => (r.email || '').toLowerCase(),
  role: (r) => `${r.is_admin ? 0 : 1}${r.role}`,
  level: (r) => (r.level && r.level !== 'unknown' ? r.level : null),
  onboarded_at: (r) => r.onboarded_at,
  lesson_count: (r) => r.lesson_count,
  session_count: (r) => r.session_count,
  created_at: (r) => r.created_at,
  last_sign_in_at: (r) => r.last_sign_in_at,
}
export const USER_SORTS = Object.keys(SORT_VALUE)
export const COUNT_SORTS = ['lesson_count', 'session_count']

/**
 * Sorted copy of list items. Empty values (never signed in, no level…) stay last in
 * both directions; ties keep the newest account first.
 */
export function sortUserItems(items, sort, dir = 'asc') {
  const get = SORT_VALUE[sort]
  if (!get) return [...items].sort(byNewest)
  const factor = dir === 'desc' ? -1 : 1
  const empty = (v) => v === null || v === undefined || v === ''
  return [...items].sort((a, b) => {
    const va = get(a)
    const vb = get(b)
    if (empty(va) !== empty(vb)) return empty(va) ? 1 : -1
    if (!empty(va) && va !== vb) {
      const c = typeof va === 'string' ? va.localeCompare(vb, 'fr') : va < vb ? -1 : 1
      if (c) return c * factor
    }
    return byNewest(a, b)
  })
}

// ---------------------------------------------------------------------------
// Privilege safety: the app must keep an active admin and an active teacher
// ---------------------------------------------------------------------------
const activeAdmin = (u) => isAdmin(u) && !isBanned(u)
const activeTeacher = (u) => getRole(u) === 'teacher' && !isBanned(u)

/**
 * True when changing `target` into `next` could remove the last admin or teacher.
 * @param {{ role: 'student'|'teacher', isAdmin: boolean, active: boolean }} next
 *   the account after the change (active = false for a ban or a deletion)
 */
export function losesPrivileges(target, next) {
  const staysAdmin = next.active && next.isAdmin
  const staysTeacher = next.active && next.role === 'teacher'
  return (activeAdmin(target) && !staysAdmin) || (activeTeacher(target) && !staysTeacher)
}

/**
 * Refuses (400, French) a change that would leave no active administrator or no
 * active teacher. `users` = every auth account.
 */
export function assertPrivilegesRemain(users, target, next) {
  const id = normalizeUuid(target.id)
  const others = users.filter((u) => normalizeUuid(u.id) !== id)
  if (activeAdmin(target) && !(next.active && next.isAdmin) && !others.some(activeAdmin)) {
    fail('Impossible : c’est le dernier compte administrateur actif. Donne d’abord l’accès admin à un autre compte.')
  }
  if (activeTeacher(target) && !(next.active && next.role === 'teacher') && !others.some(activeTeacher)) {
    fail('Impossible : c’est le dernier compte prof actif. Donne d’abord le rôle prof à un autre compte.')
  }
}
