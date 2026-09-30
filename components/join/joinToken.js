// The last join-link token opened in this browser (localStorage 'pl:joinToken'), as a
// fallback when a sign-in loses its ?next= (e.g. a redirect URL not allow-listed in
// Supabase lands on '/'): /pending then offers to open the invitation again.
// Never required: storage may be blocked (private mode), every access is guarded.
const KEY = 'pl:joinToken'
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

export function rememberJoinToken(token) {
  try {
    if (TOKEN_RE.test(token || '')) window.localStorage.setItem(KEY, token)
  } catch {
    // storage unavailable: nothing to remember
  }
}

/** The remembered token, or null. */
export function readJoinToken() {
  try {
    const token = window.localStorage.getItem(KEY)
    return token && TOKEN_RE.test(token) ? token : null
  } catch {
    return null
  }
}

export function forgetJoinToken() {
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // storage unavailable
  }
}
