// What the sign-in landing pages (/auth/callback, /auth/confirm) read from the URL and
// how they turn it into a session. Every link format works on both pages:
// - ?code=… (PKCE: Google, magic links requested from /login), exchanged by supabase-js
//   itself when the flow started in this browser;
// - ?token_hash=…&type=… (links made by the API, or email templates using {{ .TokenHash }})
//   → verifyOtp: works on any device;
// - #access_token=…&refresh_token=… (default Supabase email templates) → setSession;
// - ?error=…&error_code=… → a fixed message, never the text from the URL.
// The app is passwordless: a recovery link simply signs the user in.
// A token_hash or access_token link works in any browser, whoever it was made for, so
// the user confirms the account's email before going on (utils/auth/linkConfirm.js).
import { safeNext } from '@/utils/auth/routing'
import { linkConfirmGate } from '@/utils/auth/linkConfirm'
import { failureFromAuthError, failureFromUrl } from '@/components/auth/failures'

const OTP_TYPES = ['invite', 'magiclink', 'email', 'signup', 'recovery']

/** Replaces the address bar URL (e.g. to drop tokens) without a navigation. */
export function replaceUrl(path) {
  const state = window.history.state
  // Keep Next.js' history entry consistent with the new URL
  const nextState = state && state.__N ? { ...state, url: path, as: path } : state
  window.history.replaceState(nextState, '', path)
}

/**
 * Reads the landing URL once. One-time tokens leave the address bar right away
 * (history, screenshots, shared screens); a PKCE ?code stays until supabase-js has
 * exchanged it (establishSession cleans it afterwards).
 */
export function readLandingParams() {
  const url = new URL(window.location.href)
  const hash = new URLSearchParams(url.hash.replace(/^#/, ''))
  const get = (key) => url.searchParams.get(key) || hash.get(key)
  const params = {
    path: url.pathname,
    next: safeNext(url.searchParams.get('next')),
    code: url.searchParams.get('code'),
    tokenHash: url.searchParams.get('token_hash'),
    type: get('type'),
    accessToken: hash.get('access_token'),
    refreshToken: hash.get('refresh_token'),
    error: get('error'),
    errorCode: get('error_code'),
  }
  if (!params.code || params.error || params.errorCode) replaceUrl(params.path)
  return params
}

// `sub` claim of an access token (only to compare with the current user, never trusted)
function tokenSubject(token) {
  try {
    const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, '='))).sub || null
  } catch {
    return null
  }
}

/**
 * @param {{ force?: boolean, gate?: typeof linkConfirmGate }} [options]
 * @returns {Promise<null | { failure: string } | { signedInAs: string } | { confirmAs: string }>}
 *   null once signed in; { signedInAs } when another account is already signed in here
 *   and the link would replace it (asked first unless `force`: the link works once);
 *   { confirmAs: email } when a link signed this browser in and the user has not
 *   confirmed yet that the account is theirs.
 */
export async function establishSession(supabase, params, { force = false, gate = linkConfirmGate } = {}) {
  if (params.error || params.errorCode) return { failure: failureFromUrl(params) }

  const askIfPending = (user) => (gate.isPending(user.id) ? { confirmAs: user.email || '' } : null)

  if (params.code && !params.tokenHash && !params.accessToken) {
    // initialize() resolves once the automatic code exchange has run, with its error if any
    const { error: initError } = await supabase.auth.initialize()
    const { data } = await supabase.auth.getSession()
    replaceUrl(params.path)
    // The session may predate this code (a bogus ?code changes nothing): a pending
    // question about that account still stands
    if (data?.session) return askIfPending(data.session.user)
    if (initError) {
      // The verifier is spent after a failed exchange: a retry here cannot work
      const failure = failureFromAuthError(initError)
      return { failure: failure === 'unavailable' ? 'generic' : failure }
    }
    // A code but no verifier in this browser: the link was requested somewhere else
    return { failure: 'other_browser' }
  }

  const { data } = await supabase.auth.getSession()
  const current = data?.session?.user || null
  if (!params.tokenHash && !params.accessToken) {
    // Reloaded after the token was used (URL already cleaned), or sent back by the proxy
    // because the account was not confirmed yet: fine if signed in
    return current ? askIfPending(current) : { failure: 'invalid' }
  }
  if (params.tokenHash && !OTP_TYPES.includes(params.type)) return { failure: 'invalid' }
  if (!params.tokenHash && !params.refreshToken) return { failure: 'invalid' }

  // Someone else is signed in here (e.g. the teacher testing an invitation link).
  // The token's `sub` only spares the question for the same user's own tokens: it is not
  // verified, so the account is compared again once the session is set.
  const sameUser = params.accessToken && current && tokenSubject(params.accessToken) === current.id
  if (current && !force && !sameUser) return { signedInAs: current.email || '' }

  const { data: signedIn, error } = params.tokenHash
    ? await supabase.auth.verifyOtp({ token_hash: params.tokenHash, type: params.type })
    : await supabase.auth.setSession({ access_token: params.accessToken, refresh_token: params.refreshToken })
  if (error) return { failure: failureFromAuthError(error) }

  const user = signedIn?.user || signedIn?.session?.user || (await supabase.auth.getSession()).data?.session?.user
  if (!user?.id) return { failure: 'generic' }
  // Still the account that was signed in here: nothing new to confirm
  if (current && user.id === current.id) return askIfPending(user)
  gate.require(user.id)
  return { confirmAs: user.email || '' }
}
