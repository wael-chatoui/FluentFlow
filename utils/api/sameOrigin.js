// Same-origin check for writes. No imports: utils/auth/server.js (requireUser) and
// utils/api/validate.js both use it.

const headerValue = (value) => String(Array.isArray(value) ? value[0] : value || '').split(',')[0].trim().toLowerCase()

/**
 * True for a write (any method but GET / HEAD / OPTIONS) that a browser sent from
 * another page than ours: another site, or a sibling subdomain, whose requests carry
 * our SameSite=Lax session cookies. Browsers say where a request comes from in
 * Sec-Fetch-Site (older ones only in Origin). A request with neither header does not
 * come from a browser page, so it cannot ride on a victim's cookies.
 * A body-less POST (approve, reject, sign-in link…) or a urlencoded form needs no
 * CORS preflight, so this check is what stops them.
 */
export function isCrossSiteWrite(req) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req?.method)) return false
  const headers = req?.headers || {}
  const site = headerValue(headers['sec-fetch-site'])
  if (site) return site !== 'same-origin' && site !== 'none'
  const origin = headerValue(headers.origin)
  if (!origin) return false
  let originHost
  try {
    originHost = new URL(origin).host
  } catch {
    return true // "null" (sandboxed frame, privacy redirect) or garbage
  }
  const hosts = [headerValue(headers['x-forwarded-host']), headerValue(headers.host)].filter(Boolean)
  return !hosts.includes(originHost)
}
