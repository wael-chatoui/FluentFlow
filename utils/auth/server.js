// Authorization helpers for API routes (Pages Router).
//
// The role is read from app_metadata, which only the service role can write.
// Never read it from user_metadata: users can edit that about themselves.
import { createClient } from '@/utils/supabase/server'
import { isCrossSiteWrite } from '@/utils/api/sameOrigin'

export function getRole(user) {
  return user?.app_metadata?.role === 'teacher' ? 'teacher' : 'student'
}

/** Back office access: a separate app_metadata flag (an admin is usually also a teacher). */
export function isAdmin(user) {
  return user?.app_metadata?.is_admin === true
}

/**
 * Invite-only access: accounts created by self sign-up get app_metadata.approved = false
 * (migration 0006) until the teacher approves them. Accounts without the flag (created
 * before 0006, or invited) are approved. Teachers are always approved.
 */
export function isApproved(user) {
  return getRole(user) === 'teacher' || user?.app_metadata?.approved !== false
}

/**
 * Placeholder student created with a join link (migration 0007): the teacher prepares
 * lessons for it until the student joins. It has a fake address and never signs in.
 */
export function isPlaceholder(user) {
  return user?.app_metadata?.placeholder === true
}

/** True while a back-office ban is active (the access token may still be valid). */
export function isBanned(user) {
  const until = user?.banned_until
  return Boolean(until) && Date.parse(until) > Date.now()
}

/**
 * Rejects methods not in `methods` with 405. Returns true if the request may continue.
 * @param {string[]} methods
 */
export function allowMethods(req, res, methods) {
  if (methods.includes(req.method)) return true
  res.setHeader('Allow', methods)
  res.status(405).json({ error: 'Method Not Allowed' })
  return false
}

// Network failures / Auth server errors: the session may be fine, so no 401 (which
// would send the user to /login and lose their work).
function isAuthOutage(error) {
  return error?.name === 'AuthRetryableFetchError' || Number(error?.status) >= 500
}

// Shown as-is by the pages: English for students, French on teacher/admin routes
const AUTH_ERRORS = {
  unavailable: {
    en: 'Sign-in service unavailable. Please try again in a moment.',
    fr: 'Service de connexion indisponible. Réessaie dans un instant.',
  },
  unauthorized: {
    en: 'Your session has expired. Please sign in again.',
    fr: 'Ta session a expiré. Reconnecte-toi.',
  },
  banned: { en: 'This account is suspended.', fr: 'Ce compte est suspendu.' },
  pending: {
    en: 'Your account is waiting for your teacher’s approval.',
    fr: 'Ce compte attend la validation du professeur.',
  },
  crossSite: {
    en: 'Request refused: it did not come from the app.',
    fr: 'Requête refusée : elle ne vient pas de l’application.',
  },
}

/**
 * Resolves the logged-in user from the auth cookies (or a Bearer token).
 * Sends 403 { code: 'cross_site' } for a write from another site, 401 when not
 * authenticated, 503 when Supabase Auth is unreachable,
 * 403 `{ code: 'banned' }` when banned, and 403 `{ code: 'pending' }` for an account
 * waiting for the teacher's approval (unless `allowPending`, e.g. for GET /api/me).
 * @param {{ allowPending?: boolean, lang?: 'en'|'fr' }} [options]  lang: of the error messages
 * @returns {Promise<{ user: import('@supabase/supabase-js').User, role: 'student'|'teacher' } | null>}
 */
export async function requireUser(req, res, { allowPending = false, lang = 'en' } = {}) {
  const message = (key) => AUTH_ERRORS[key][lang] || AUTH_ERRORS[key].en
  // CSRF: our session cookies are SameSite=Lax, so a write from another site or a
  // sibling subdomain (body-less POST, urlencoded form) would otherwise be authenticated
  if (isCrossSiteWrite(req)) {
    res.status(403).json({ error: message('crossSite'), code: 'cross_site' })
    return null
  }
  const supabase = createClient({ req, res })
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '')

  let result
  try {
    result = bearer ? await supabase.auth.getUser(bearer) : await supabase.auth.getUser()
  } catch (err) {
    console.error('[auth] getUser threw:', err)
    res.status(503).json({ error: message('unavailable') })
    return null
  }

  const { data, error } = result
  if (error && isAuthOutage(error)) {
    console.error('[auth] getUser failed:', error)
    res.status(503).json({ error: message('unavailable') })
    return null
  }
  if (error || !data?.user) {
    res.status(401).json({ error: message('unauthorized') })
    return null
  }
  // Never signs in (fake address); a session for it would be a bug: refuse it
  if (isPlaceholder(data.user)) {
    res.status(401).json({ error: message('unauthorized') })
    return null
  }
  if (isBanned(data.user)) {
    res.status(403).json({ error: message('banned'), code: 'banned' })
    return null
  }
  if (!allowPending && !isApproved(data.user)) {
    res.status(403).json({ error: message('pending'), code: 'pending' })
    return null
  }
  return { user: data.user, role: getRole(data.user) }
}

/** Like requireUser (French errors), but also sends 403 unless the user is a teacher. */
export async function requireTeacher(req, res) {
  const auth = await requireUser(req, res, { lang: 'fr' })
  if (!auth) return null
  if (auth.role !== 'teacher') {
    res.status(403).json({ error: 'Accès réservé au professeur.' })
    return null
  }
  return auth
}

/** Like requireUser (French errors), but also sends 403 unless the user is an admin (back office). */
export async function requireAdmin(req, res) {
  const auth = await requireUser(req, res, { lang: 'fr' })
  if (!auth) return null
  if (!isAdmin(auth.user)) {
    res.status(403).json({ error: 'Accès réservé aux administrateurs.' })
    return null
  }
  return auth
}

/** Logs the real error server-side, returns a generic message to the client. */
export function serverError(res, err, context) {
  console.error(`[api] ${context}:`, err)
  res.status(500).json({ error: 'Something went wrong. Please try again.' })
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Canonical (lowercase) form of a UUID, so comparisons with auth ids are exact. */
export const normalizeUuid = (value) => String(value || '').toLowerCase()
