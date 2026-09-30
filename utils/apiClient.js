// Browser-side fetch wrapper for our own API routes.
// Auth travels in the Supabase cookies, so no token handling is needed here.
import { createClient } from '@/utils/supabase/client'
import { clearAuthCookies } from '@/utils/supabase/signOut'
import { clearLinkConfirm } from '@/utils/auth/linkConfirm'

export class ApiError extends Error {
  constructor(message, status, code) {
    super(message)
    this.status = status
    this.code = code
  }
}

// Teacher / back-office pages set <html lang="fr"> (pages/_document.js)
const isFrench = () => typeof document !== 'undefined' && /^fr/i.test(document.documentElement.lang || '')

const MESSAGES = {
  network: {
    en: 'Network error — check your connection and try again.',
    fr: 'Problème de connexion — vérifie ta connexion et réessaie.',
  },
  timeout: {
    en: 'The server took too long to answer. Please try again.',
    fr: 'Le serveur met trop de temps à répondre. Réessaie.',
  },
  failed: {
    en: (status) => `Request failed (${status}).`,
    fr: (status) => `La requête a échoué (${status}).`,
  },
  // Only seen when the user stays on the page (unsaved changes) instead of going to /login
  sessionExpired: {
    en: 'Your session has expired. Sign in again (in another tab to keep this page open), then try again.',
    fr: 'Ta session a expiré. Reconnecte-toi (dans un autre onglet pour garder cette page), puis réessaie.',
  },
}

// A request that never answers must not leave a spinner forever
const DEFAULT_TIMEOUT_MS = 60_000

let redirecting = false

// The server rejected the session (expired, signed out elsewhere, deleted account…):
// clear it here (cookies only, no request), otherwise /login would see a "signed-in"
// browser and bounce back here in a loop.
function toLogin() {
  if (redirecting) return
  redirecting = true
  clearAuthCookies(createClient()?.auth?.storageKey)
  clearLinkConfirm()
  const here = `${window.location.pathname}${window.location.search}`
  const next = here && here !== '/' && !here.startsWith('/login') ? `?next=${encodeURIComponent(here)}` : ''
  window.location.href = `/login${next}`
  // Still here a moment later: the user chose to stay (unsaved changes prompt). The next
  // 401 may offer /login again; meanwhile signing in in another tab brings the session back.
  setTimeout(() => {
    redirecting = false
  }, 1000)
}

/**
 * @param {string} path  e.g. '/api/student/lessons'
 * @param {{ method?: string, body?: unknown, signal?: AbortSignal, raw?: BodyInit, headers?: object,
 *           timeout?: number }} [options]
 *   raw: send this body as-is (e.g. a PDF File) instead of JSON
 *   timeout: ms before giving up (default 60 s) → ApiError with code 'timeout'
 * @returns {Promise<any>} parsed JSON body
 * @throws {ApiError} with the server's `error` message (and `code`) on non-2xx responses;
 *   401 → code 'session_expired' (the browser is also sent to /login)
 */
export async function api(path, { method = 'GET', body, signal, raw, headers, timeout = DEFAULT_TIMEOUT_MS } = {}) {
  const lang = isFrench() ? 'fr' : 'en'
  const timer = new AbortController()
  const timeoutId = setTimeout(() => timer.abort(), timeout)
  const onAbort = () => timer.abort()
  signal?.addEventListener('abort', onAbort, { once: true })
  if (signal?.aborted) timer.abort()

  let res
  try {
    res = await fetch(path, {
      method,
      signal: timer.signal,
      headers: {
        ...(body !== undefined && raw === undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(headers || {}),
      },
      body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', onAbort)
    if (signal?.aborted) throw err // the caller cancelled: let it see the AbortError
    if (timer.signal.aborted) throw new ApiError(MESSAGES.timeout[lang], 0, 'timeout')
    throw new ApiError(MESSAGES.network[lang], 0)
  }

  const data = await res.json().catch(() => ({}))
  clearTimeout(timeoutId)
  signal?.removeEventListener('abort', onAbort)
  if (!res.ok) {
    if (typeof window !== 'undefined') {
      if (res.status === 401) toLogin()
      else if (res.status === 403 && data.code === 'pending' && window.location.pathname !== '/pending') {
        window.location.href = '/pending'
      }
    }
    if (res.status === 401) throw new ApiError(MESSAGES.sessionExpired[lang], 401, 'session_expired')
    throw new ApiError(data.error || MESSAGES.failed[lang](res.status), res.status, data.code)
  }
  return data
}
