// Browser sign-out that does not rely on auth-js to clear the browser.
// supabase.auth.signOut() first loads the session: when the access token has expired and
// cannot be refreshed (offline, Supabase Auth unreachable) it returns an error before
// removing anything, so the refresh token stays in the cookies and auto-refresh (or the
// next page load) signs the user back in. The call has no timeout either: a stalled
// connection would leave the caller waiting for minutes.

// A sign-out the server has not answered by then goes on in the background
export const SIGN_OUT_TIMEOUT_MS = 8000

const TIMED_OUT = Symbol('timed out')

function within(promise, ms) {
  let timer
  const timeout = new Promise((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}

/** document.cookie, where the Supabase browser client (@supabase/ssr) keeps the session. */
export const documentCookies = {
  read: () => (typeof document === 'undefined' ? '' : document.cookie),
  write: (cookie) => {
    if (typeof document !== 'undefined') document.cookie = cookie
  },
}

/**
 * Names of the cookies that hold a Supabase browser session: `<key>` or its chunks
 * (`<key>.0`, `<key>.1`…), plus the PKCE verifiers and user copy (`<key>-…`).
 * Without a key: every `sb-…-auth-token…` cookie.
 * @param {string} cookieHeader  e.g. document.cookie
 * @param {string} [storageKey]  supabase.auth.storageKey, e.g. 'sb-abcd-auth-token'
 * @returns {string[]}
 */
export function authCookieNames(cookieHeader, storageKey) {
  const names = String(cookieHeader || '')
    .split(';')
    .map((part) => part.split('=')[0].trim())
    .filter(Boolean)
  const isAuthCookie = storageKey
    ? (name) => name === storageKey || name.startsWith(`${storageKey}.`) || name.startsWith(`${storageKey}-`)
    : (name) => /^sb-.+-auth-token(?:[.-].*)?$/.test(name)
  return [...new Set(names.filter(isAuthCookie))]
}

/**
 * Deletes the session cookies directly (no request), at the scope @supabase/ssr sets
 * them (host-only, Path=/). @returns {number} how many there were
 */
export function clearAuthCookies(storageKey, jar = documentCookies) {
  const names = authCookieNames(jar.read(), storageKey)
  names.forEach((name) => jar.write(`${name}=; Path=/; Max-Age=0; SameSite=Lax`))
  return names.length
}

/**
 * Signs out: scope 'global' ends the sessions on every device, 'local' this one only.
 * Never throws and never waits more than `timeoutMs`; this browser is signed out
 * afterwards in every case, even offline.
 * @param {import('@supabase/supabase-js').SupabaseClient|null} supabase  browser client
 * @returns {Promise<{ revoked: boolean, timedOut: boolean }>}
 *   revoked: the server confirmed the sign-out (false: other devices may still be signed
 *   in after a global sign-out). timedOut: the call is still running; when it ends it
 *   clears whatever session is stored then, so leave the page with a full load.
 */
export async function endSession(supabase, { scope = 'global', timeoutMs = SIGN_OUT_TIMEOUT_MS, jar = documentCookies } = {}) {
  if (!supabase) return { revoked: false, timedOut: false }
  let outcome
  try {
    outcome = await within(supabase.auth.signOut({ scope }), timeoutMs)
  } catch (err) {
    outcome = { error: err }
  }
  const timedOut = outcome === TIMED_OUT
  if (timedOut) console.error(`[auth] signOut (${scope}) timed out`)
  else if (outcome?.error) console.error(`[auth] signOut (${scope}) failed:`, outcome.error)

  // Whatever is left would sign the user back in. A refresh still in flight cannot write
  // it back: auth-js drops rotated tokens when the stored session changed meanwhile.
  if (clearAuthCookies(supabase.auth?.storageKey, jar) > 0 && !timedOut) {
    // Nothing is stored any more, so this sends no request: it only tells this tab's
    // listeners and the other tabs (SIGNED_OUT). Skipped after a timeout, when auth-js
    // may still be busy with the stuck call.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
  }
  return { revoked: !timedOut && !outcome?.error, timedOut }
}

// Tells /login, right after a global sign-out that only worked on this device, that the
// other devices may still be signed in (sessionStorage: this tab only, read once)
const PARTIAL_KEY = 'pl-signout-partial'
const PARTIAL_MAX_AGE_MS = 2 * 60 * 1000

export function rememberPartialSignOut() {
  try {
    window.sessionStorage.setItem(PARTIAL_KEY, String(Date.now()))
  } catch {
    // Storage blocked: /login simply shows no note
  }
}

/** True once, just after a global sign-out that could not reach the server. */
export function takePartialSignOut() {
  try {
    const at = Number(window.sessionStorage.getItem(PARTIAL_KEY))
    window.sessionStorage.removeItem(PARTIAL_KEY)
    return at > 0 && Date.now() - at < PARTIAL_MAX_AGE_MS
  } catch {
    return false
  }
}
