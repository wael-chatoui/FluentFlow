// Login-CSRF guard for sign-in links. A ?token_hash or #access_token link signs the
// browser into whichever account it was made for, so anyone could send their own link
// to a signed-out student, who would then fill in (goals, interests, answers) the
// sender's account. Once such a link has signed a browser in, the user sees the
// account's email and confirms it is theirs before going anywhere: until then this
// cookie holds the account id and the proxy sends every app page back to /auth/confirm
// (closing the tab does not skip the question). Google and the magic links requested
// from /login (PKCE) need no question: they only work in the browser that asked for them.
export const LINK_CONFIRM_COOKIE = 'pl-link-confirm'
const MAX_AGE_S = 60 * 60 * 24 * 30

/** Value of cookie `name` in a Cookie header or document.cookie string, else null. */
export function readCookie(cookieHeader, name) {
  for (const part of String(cookieHeader || '').split(';')) {
    const at = part.indexOf('=')
    if (at > 0 && part.slice(0, at).trim() === name) {
      try {
        return decodeURIComponent(part.slice(at + 1).trim())
      } catch {
        return null
      }
    }
  }
  return null
}

const writeCookie = (value, maxAge) => {
  if (typeof document === 'undefined') return
  const secure = window.location?.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${LINK_CONFIRM_COOKIE}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`
}

/** Forgets the question (confirmed, or signed out). */
export function clearLinkConfirm() {
  writeCookie('', 0)
}

/** Browser implementation used by the sign-in landing (components/auth/landing.js). */
export const linkConfirmGate = {
  /** True while account `userId` was signed in by a link and not confirmed yet. */
  isPending: (userId) =>
    typeof document !== 'undefined' && Boolean(userId) && readCookie(document.cookie, LINK_CONFIRM_COOKIE) === userId,
  require: (userId) => writeCookie(userId, MAX_AGE_S),
  clear: clearLinkConfirm,
}
