// Pure routing helpers shared by the proxy, the auth pages and the root router.
// No Supabase or browser imports: safe to use anywhere and unit-tested.

const MAX_NEXT_LENGTH = 512
const PARSE_BASE = 'http://next.invalid'

// Control characters, whitespace (incl. no-break and line/paragraph separators)
const hasUnsafeChar = (value) =>
  Array.from(value).some((ch) => {
    const code = ch.codePointAt(0)
    return code <= 0x20 || (code >= 0x7f && code <= 0xa0) || code === 0x2028 || code === 0x2029
  })

/** True when `path` (a same-origin path, query/hash allowed) is `area` or below it. */
export function inArea(path, area) {
  const pathname = String(path || '').split(/[?#]/)[0]
  return pathname === area || pathname.startsWith(`${area}/`)
}

/**
 * `next` from a URL (?next=…) when it is a same-origin relative path, else null.
 * Rejects protocol-relative ('//host', '/\host'), schemes, control characters,
 * whitespace and anything that would resolve to another origin (open redirect).
 * Returns the normalized path: area checks must see where the browser will really go
 * ('/teacher/../logout' is '/logout', not a teacher page).
 * @param {unknown} next
 * @returns {string|null}
 */
export function safeNext(next) {
  const value = Array.isArray(next) ? next[0] : next
  if (typeof value !== 'string' || !value || value.length > MAX_NEXT_LENGTH) return null
  if (value[0] !== '/' || value[1] === '/' || value.includes('\\')) return null
  // Browsers drop tabs/newlines inside URLs ('/\t/evil.com' → '//evil.com')
  if (hasUnsafeChar(value)) return null
  try {
    const url = new URL(value, PARSE_BASE)
    // Dot segments can turn '/.//evil.com' into the path '//evil.com'
    if (url.origin !== PARSE_BASE || url.pathname.startsWith('//')) return null
    const normalized = `${url.pathname}${url.search}${url.hash}`
    return normalized.length > MAX_NEXT_LENGTH ? null : normalized
  } catch {
    return null
  }
}

/** True for a join-link page (/join/<token>): public, and where a new student finishes joining. */
export const isJoinPath = (path) => inArea(path, '/join') && String(path).split(/[?#]/)[0].length > '/join/'.length

/**
 * Where to send a user right after sign-in (or when they land on '/' or /login signed in).
 * `next` is only honoured inside the user's own area, and never before approval/onboarding,
 * except a join link (/join/<token>): a student, approved or not, goes back to it to claim it.
 * @param {{ role?: 'teacher'|'student'|null, approved?: boolean, onboarded?: boolean,
 *           isAdmin?: boolean, next?: unknown }} input
 * @returns {string}
 */
export function pathAfterSignIn({ role, approved = true, onboarded = false, isAdmin = false, next = null } = {}) {
  const target = safeNext(next)
  if (role === 'teacher') {
    return target && (inArea(target, '/teacher') || inArea(target, '/admin')) ? target : '/teacher'
  }
  // The join page approves the account (POST /api/join/[token]/claim)
  if (target && isJoinPath(target)) return target
  // Missing flag = approved (accounts created before invite-only access), like the server
  if (approved === false) return '/pending'
  if (isAdmin && target && inArea(target, '/admin')) return target
  if (!onboarded) return '/onboarding'
  return target && inArea(target, '/student') ? target : '/student'
}

const LANDING_QUERY_KEYS = ['token_hash', 'error', 'error_code', 'error_description']
const LANDING_HASH_KEYS = ['access_token', 'refresh_token', 'error', 'error_code', 'error_description']

/**
 * Supabase Auth sends a sign-in to the Site URL root instead of `redirect_to` when that
 * host is not allow-listed (vercel.app alias, www variant, preview deployment). Only the
 * landing pages understand the parameters it brings, so '/' hands them over: returns
 * '/auth/confirm' + the URL's query and hash, or null when there is nothing to hand over.
 * A PKCE ?code is supabase-js' own business once the browser is signed in (exchanged
 * already); without a session the landing explains why it could not be used.
 * @param {{ search?: string, hash?: string }} location  e.g. window.location
 * @param {{ signedIn?: boolean }} [state]
 * @returns {string|null}
 */
export function authLandingRedirect({ search = '', hash = '' } = {}, { signedIn = false } = {}) {
  const query = new URLSearchParams(search)
  const fragment = new URLSearchParams(String(hash).replace(/^#/, ''))
  const carriesSignIn =
    LANDING_QUERY_KEYS.some((key) => query.has(key)) ||
    LANDING_HASH_KEYS.some((key) => fragment.has(key)) ||
    (query.has('code') && !signedIn)
  return carriesSignIn ? `/auth/confirm${search}${hash}` : null
}

/** `<html lang>` for a page: the teacher area and the back office are in French. */
export function pageLang(pathname) {
  return inArea(pathname, '/teacher') || inArea(pathname, '/admin') ? 'fr' : 'en'
}
