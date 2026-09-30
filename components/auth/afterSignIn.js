// Where a signed-in user should go (login, auth landings, '/', /pending).
import { api } from '@/utils/apiClient'
import { pathAfterSignIn } from '@/utils/auth/routing'

/**
 * Asks the server (fresh role, approval and onboarding state), then applies the
 * routing rules. Throws ApiError like api(); a 401 already sends the user to /login.
 * @param {{ next?: string|null, signal?: AbortSignal }} [options]
 */
export async function destinationAfterSignIn({ next = null, signal } = {}) {
  const me = await api('/api/me', { signal })
  return pathAfterSignIn({
    role: me?.role,
    approved: me?.approved,
    onboarded: Boolean(me?.profile?.onboarded_at),
    isAdmin: me?.isAdmin === true,
    next,
  })
}

/**
 * Best guess from the browser session when /api/me cannot be reached. Onboarding and
 * approval are assumed done: the proxy (fresh account) sends the student to /onboarding
 * or /pending if not. The session's approval flag is not used: it stays `false` for up
 * to an hour after the teacher's approval, and /pending would then bounce back to '/'.
 */
export function fallbackDestination(user, next = null) {
  const meta = user?.app_metadata || {}
  return pathAfterSignIn({
    role: meta.role === 'teacher' ? 'teacher' : 'student',
    approved: true,
    onboarded: true,
    isAdmin: meta.is_admin === true,
    next,
  })
}
