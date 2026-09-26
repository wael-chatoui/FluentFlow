// Authorization helpers for API routes (Pages Router).
//
// The role is read from app_metadata, which only the service role can write.
// Never read it from user_metadata: users can edit that about themselves.
import { createClient } from '@/utils/supabase/server'

export function getRole(user) {
  return user?.app_metadata?.role === 'teacher' ? 'teacher' : 'student'
}

/** Back office access: a separate app_metadata flag (an admin is usually also a teacher). */
export function isAdmin(user) {
  return user?.app_metadata?.is_admin === true
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

/**
 * Resolves the logged-in user from the auth cookies (or a Bearer token).
 * Sends 401 and returns null when not authenticated.
 * @returns {Promise<{ user: import('@supabase/supabase-js').User, role: 'student'|'teacher' } | null>}
 */
export async function requireUser(req, res) {
  const supabase = createClient({ req, res })
  const bearer = req.headers.authorization?.replace(/^Bearer\s+/i, '')
  const { data, error } = bearer
    ? await supabase.auth.getUser(bearer)
    : await supabase.auth.getUser()

  if (error || !data?.user) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }
  return { user: data.user, role: getRole(data.user) }
}

/** Like requireUser, but also sends 403 unless the user is a teacher. */
export async function requireTeacher(req, res) {
  const auth = await requireUser(req, res)
  if (!auth) return null
  if (auth.role !== 'teacher') {
    res.status(403).json({ error: 'Forbidden — teacher role required' })
    return null
  }
  return auth
}

/** Like requireUser, but also sends 403 unless the user is an admin (back office). */
export async function requireAdmin(req, res) {
  const auth = await requireUser(req, res)
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
