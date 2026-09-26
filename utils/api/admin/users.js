// Auth users for the back office: listing every account (Auth admin API),
// merging with profiles and building the documented user shapes.
import { getRole, isAdmin } from '@/utils/auth/server'

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
    if (batch.length < AUTH_PAGE) break
  }
  return users.slice(0, MAX_USERS)
}

/** Auth user by id, or null when it does not exist. */
export async function getAuthUser(admin, id) {
  const { data, error } = await admin.auth.admin.getUserById(id)
  if (error && error.status !== 404 && !/not.?found/i.test(error.message || '')) throw error
  return data?.user || null
}

/** True when banned_until is in the future. */
export function isBanned(user, now = Date.now()) {
  const until = Date.parse(user?.banned_until || '')
  return Number.isFinite(until) && until > now
}

export function providersOf(user) {
  const fromMeta = user?.app_metadata?.providers
  const list = Array.isArray(fromMeta) && fromMeta.length
    ? fromMeta
    : (user?.identities || []).map((i) => i?.provider)
  return [...new Set(list.filter((p) => typeof p === 'string' && p))]
}

/** 'admin' | 'teacher' | 'student' filter. */
export function matchesRole(user, role) {
  if (!role || role === 'all') return true
  if (role === 'admin') return isAdmin(user)
  return getRole(user) === role
}

/** { id, email, created_at, last_sign_in_at, role, is_admin, banned, providers } */
export function authSummary(user) {
  return {
    id: user.id,
    email: user.email || '',
    created_at: user.created_at || null,
    last_sign_in_at: user.last_sign_in_at || null,
    role: getRole(user),
    is_admin: isAdmin(user),
    banned: isBanned(user),
    providers: providersOf(user),
  }
}

/** List item: { id, email, full_name, role, is_admin, level, onboarded_at, created_at, last_sign_in_at, banned, lesson_count, session_count } */
export function userListItem(user, profile, counts = {}) {
  return {
    id: user.id,
    email: user.email || profile?.email || '',
    full_name: profile?.full_name || user.user_metadata?.full_name || null,
    role: getRole(user),
    is_admin: isAdmin(user),
    level: profile?.level || null,
    onboarded_at: profile?.onboarded_at || null,
    created_at: user.created_at || profile?.created_at || null,
    last_sign_in_at: user.last_sign_in_at || null,
    banned: isBanned(user),
    lesson_count: counts.lessons || 0,
    session_count: counts.sessions || 0,
  }
}

/** Case-insensitive substring match on email and full name. */
export function matchesQuery(user, profile, q) {
  if (!q) return true
  const needle = q.toLowerCase()
  const name = profile?.full_name || user.user_metadata?.full_name || ''
  return (user.email || '').toLowerCase().includes(needle) || name.toLowerCase().includes(needle)
}

export const byNewest = (a, b) => (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0)

const HOST_RE = /^[a-z0-9.-]+(:\d{1,5})?$/i

function backofficeHosts() {
  return (process.env.BACKOFFICE_HOSTS || 'backoffice.lurl.com,backoffice.localhost')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
}

/**
 * Public origin for links sent by email, from the request (x-forwarded-host/host +
 * x-forwarded-proto). On a back-office host, NEXT_PUBLIC_SITE_URL wins when set,
 * so invited students land on the main app rather than inside /admin.
 */
export function requestOrigin(req) {
  const first = (v) => String(Array.isArray(v) ? v[0] : v || '').split(',')[0].trim()
  const host = first(req.headers?.['x-forwarded-host']) || first(req.headers?.host)
  const site = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '')
  if (!host || !HOST_RE.test(host)) return site || 'http://localhost:3000'
  if (site && backofficeHosts().includes(host.toLowerCase().replace(/:\d+$/, ''))) return site
  const forwarded = first(req.headers?.['x-forwarded-proto']).toLowerCase()
  const local = /^(localhost|127\.0\.0\.1|[^:]+\.localhost)(:\d+)?$/i.test(host)
  const proto = forwarded === 'http' || forwarded === 'https' ? forwarded : local ? 'http' : 'https'
  return `${proto}://${host}`
}
