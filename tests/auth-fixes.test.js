import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Fake Supabase for the server-side helpers (requireUser, proxy)
const fake = { user: null, error: null, throws: false }
const serverAuth = {
  getUser: async () => {
    if (fake.throws) throw new Error('fetch failed')
    return { data: { user: fake.user }, error: fake.error }
  },
}
vi.mock('@supabase/ssr', () => ({ createServerClient: () => ({ auth: serverAuth }) }))
vi.mock('@/utils/supabase/server', () => ({ createClient: () => ({ auth: serverAuth }) }))
vi.mock('@/utils/supabase/client', () => ({ createClient: () => ({ auth: { storageKey: 'sb-proj-auth-token' } }) }))
vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { onboarded_at: '2026-01-01T00:00:00Z' }, error: null }) }) }),
    }),
  }),
}))

const { authCookieNames, clearAuthCookies, endSession, rememberPartialSignOut, takePartialSignOut } = await import(
  '@/utils/supabase/signOut'
)
const { LINK_CONFIRM_COOKIE, readCookie } = await import('@/utils/auth/linkConfirm')
const { markAppStarted, reachedFromApp } = await import('@/utils/auth/appNavigation')
const { authLandingRedirect } = await import('@/utils/auth/routing')
const { fallbackDestination } = await import('@/components/auth/afterSignIn')
const { establishSession } = await import('@/components/auth/landing')
const { api } = await import('@/utils/apiClient')
const { requireAdmin, requireTeacher, requireUser } = await import('@/utils/auth/server')
const { proxy } = await import('@/proxy')

// document.cookie-like jar: reading gives "a=1; b=2", writing "name=…; Max-Age=0" deletes
function cookieJar(initial = {}) {
  const cookies = new Map(Object.entries(initial))
  return {
    cookies,
    writes: [],
    read: () => [...cookies].map(([name, value]) => `${name}=${value}`).join('; '),
    write(cookie) {
      this.writes.push(cookie)
      const [pair] = cookie.split(';')
      const at = pair.indexOf('=')
      const name = pair.slice(0, at)
      if (/max-age=0/i.test(cookie)) cookies.delete(name)
      else cookies.set(name, pair.slice(at + 1))
    },
  }
}

const KEY = 'sb-proj-auth-token'
const SESSION_COOKIES = { [`${KEY}.0`]: 'base64-aaa', [`${KEY}.1`]: 'base64-bbb', [`${KEY}-code-verifier`]: 'v', other: 'keep' }

// auth-js signOut() that never touches the jar, as when it cannot refresh an expired token
const stuckAuth = (result) => ({ storageKey: KEY, signOut: vi.fn(async ({ scope }) => (scope === 'local' ? { error: null } : result)) })

afterEach(() => {
  vi.useRealTimers()
  delete globalThis.window
  delete globalThis.document
  delete globalThis.fetch
})

describe('sign-out that always clears this browser (auth-1, auth-6)', () => {
  it('finds the session cookies, their chunks and the PKCE verifiers only', () => {
    const header = `${KEY}.0=a; ${KEY}.1=b; ${KEY}-code-verifier=v; ${KEY}-flow-1-code-verifier=w; sb-other-auth-token=x; pl-onboarded=u; theme=dark`
    expect(authCookieNames(header, KEY)).toEqual([`${KEY}.0`, `${KEY}.1`, `${KEY}-code-verifier`, `${KEY}-flow-1-code-verifier`])
    // Without the key: any Supabase auth cookie
    expect(authCookieNames(header)).toContain('sb-other-auth-token')
    expect(authCookieNames(header)).not.toContain('pl-onboarded')
    expect(authCookieNames('', KEY)).toEqual([])
  })

  it('deletes them at the scope @supabase/ssr sets them', () => {
    const jar = cookieJar(SESSION_COOKIES)
    expect(clearAuthCookies(KEY, jar)).toBe(3)
    expect([...jar.cookies.keys()]).toEqual(['other'])
    expect(jar.writes[0]).toBe(`${KEY}.0=; Path=/; Max-Age=0; SameSite=Lax`)
  })

  it('keeps the global sign-out as is when it works', async () => {
    const jar = cookieJar({ other: 'keep' }) // auth-js removed the session itself
    const supabase = { auth: { storageKey: KEY, signOut: vi.fn(async () => ({ error: null })) } }
    expect(await endSession(supabase, { jar })).toEqual({ revoked: true, timedOut: false })
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1)
    expect(supabase.auth.signOut).toHaveBeenCalledWith({ scope: 'global' })
  })

  it('removes the session auth-js left behind (expired token, offline) and tells the other tabs', async () => {
    const jar = cookieJar(SESSION_COOKIES)
    const supabase = { auth: stuckAuth({ error: { name: 'AuthRetryableFetchError', status: 0 } }) }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await endSession(supabase, { jar })).toEqual({ revoked: false, timedOut: false })
    expect([...jar.cookies.keys()]).toEqual(['other'])
    expect(supabase.auth.signOut).toHaveBeenLastCalledWith({ scope: 'local' })
  })

  it('never waits for a stalled sign-out', async () => {
    const jar = cookieJar(SESSION_COOKIES)
    const supabase = { auth: { storageKey: KEY, signOut: vi.fn(() => new Promise(() => {})) } }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await endSession(supabase, { jar, timeoutMs: 10 })).toEqual({ revoked: false, timedOut: true })
    expect([...jar.cookies.keys()]).toEqual(['other'])
    // No second call behind the stuck one
    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1)
  })

  it('never throws', async () => {
    const jar = cookieJar(SESSION_COOKIES)
    const supabase = { auth: { storageKey: KEY, signOut: vi.fn(async () => Promise.reject(new Error('boom'))) } }
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(await endSession(supabase, { jar, scope: 'local' })).toEqual({ revoked: false, timedOut: false })
    expect(jar.cookies.has(`${KEY}.0`)).toBe(false)
    expect(await endSession(null, { jar })).toEqual({ revoked: false, timedOut: false })
  })

  it('tells /login once, shortly after, that other devices may still be signed in', () => {
    const store = new Map()
    globalThis.window = {
      sessionStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, v),
        removeItem: (k) => store.delete(k),
      },
    }
    expect(takePartialSignOut()).toBe(false)
    rememberPartialSignOut()
    expect(takePartialSignOut()).toBe(true)
    expect(takePartialSignOut()).toBe(false)
    store.set('pl-signout-partial', String(Date.now() - 10 * 60 * 1000))
    expect(takePartialSignOut()).toBe(false)
    // Storage blocked
    globalThis.window = {}
    expect(takePartialSignOut()).toBe(false)
  })
})

describe('/logout only signs out without a click from inside the app (security-6)', () => {
  it('is false for the first page of a page load, true after it', () => {
    expect(reachedFromApp()).toBe(false)
    markAppStarted()
    expect(reachedFromApp()).toBe(true)
  })
})

describe('link sign-ins are confirmed by the user (security-5)', () => {
  const linkUser = { id: 'attacker', email: 'a@example.com' }
  const supabase = ({ session = null, user = linkUser } = {}) => ({
    auth: {
      initialize: vi.fn(async () => ({ error: null })),
      getSession: vi.fn(async () => ({ data: { session } })),
      verifyOtp: vi.fn(async () => ({ data: { user, session: { user } }, error: null })),
      setSession: vi.fn(async () => ({ data: { user, session: { user } }, error: null })),
    },
  })
  const gate = (pendingFor = null) => {
    const g = {
      pendingFor,
      isPending: (id) => g.pendingFor === id,
      require: vi.fn((id) => {
        g.pendingFor = id
      }),
      clear: vi.fn(),
    }
    return g
  }
  beforeEach(() => {
    globalThis.window = { location: { href: 'http://app.test/auth/callback' }, history: { state: null, replaceState: vi.fn() } }
  })

  it('asks a signed-out visitor whose account an #access_token link opened', async () => {
    const g = gate()
    const client = supabase()
    expect(await establishSession(client, { accessToken: 'h.e30.s', refreshToken: 'r' }, { gate: g })).toEqual({ confirmAs: 'a@example.com' })
    expect(g.require).toHaveBeenCalledWith('attacker')
  })

  it('keeps asking until confirmed (reload, or sent back by the proxy)', async () => {
    const session = { user: linkUser }
    expect(await establishSession(supabase({ session }), {}, { gate: gate('attacker') })).toEqual({ confirmAs: 'a@example.com' })
    expect(await establishSession(supabase({ session }), {}, { gate: gate() })).toBeNull()
  })

  it('is not skipped by a bogus ?code on /auth/callback', async () => {
    const g = gate('attacker')
    expect(await establishSession(supabase({ session: { user: linkUser } }), { code: 'x', path: '/auth/callback' }, { gate: g })).toEqual({
      confirmAs: 'a@example.com',
    })
    expect(g.clear).not.toHaveBeenCalled()
  })

  it('checks the account behind implicit tokens whose unverified `sub` claims to be the signed-in user', async () => {
    const me = { id: 'victim', email: 'v@example.com' }
    const forged = `h.${Buffer.from(JSON.stringify({ sub: 'victim' })).toString('base64url')}.s`
    const g = gate()
    const client = supabase({ session: { user: me } })
    expect(await establishSession(client, { accessToken: forged, refreshToken: 'r' }, { gate: g })).toEqual({ confirmAs: 'a@example.com' })
    expect(g.require).toHaveBeenCalledWith('attacker')
  })

  it('reads the confirmation cookie', () => {
    expect(readCookie(`a=1; ${LINK_CONFIRM_COOKIE}=u-1; b=2`, LINK_CONFIRM_COOKIE)).toBe('u-1')
    expect(readCookie('a=1', LINK_CONFIRM_COOKIE)).toBeNull()
    expect(readCookie(`x${LINK_CONFIRM_COOKIE}=u-1`, LINK_CONFIRM_COOKIE)).toBeNull()
    expect(readCookie(`${LINK_CONFIRM_COOKIE}=%E0%A4%A`, LINK_CONFIRM_COOKIE)).toBeNull()
  })
})

describe('proxy', () => {
  const student = { id: 'u-1', email: 's@example.com', app_metadata: { role: 'student' } }
  async function visit(path, cookie) {
    const headers = { host: 'app.test' }
    if (cookie) headers.cookie = cookie
    const res = await proxy(new NextRequest(`http://app.test${path}`, { headers }))
    return res.headers.get('location')?.replace(/^http:\/\/[^/]+/, '') ?? null
  }
  beforeEach(() => {
    fake.user = student
    fake.error = null
    fake.throws = false
  })

  it('sends every app page back to /auth/confirm until the link sign-in is confirmed', async () => {
    const cookie = `${LINK_CONFIRM_COOKIE}=u-1; pl-onboarded=u-1`
    expect(await visit('/student/lessons?tab=all', cookie)).toBe(`/auth/confirm?next=${encodeURIComponent('/student/lessons?tab=all')}`)
    expect(await visit('/onboarding', cookie)).toBe(`/auth/confirm?next=${encodeURIComponent('/onboarding')}`)
    // Not for another account, and not on the public pages
    expect(await visit('/student', `${LINK_CONFIRM_COOKIE}=someone-else; pl-onboarded=u-1`)).toBeNull()
    expect(await visit('/login', cookie)).toBeNull()
  })
})

describe('root page hands sign-in parameters to the landing (auth-2)', () => {
  it('forwards tokens, token hashes and errors, keeping the query and the hash', () => {
    expect(authLandingRedirect({ search: '', hash: '#access_token=a&refresh_token=r&type=invite' })).toBe(
      '/auth/confirm#access_token=a&refresh_token=r&type=invite'
    )
    expect(authLandingRedirect({ search: '?token_hash=t&type=magiclink', hash: '' })).toBe('/auth/confirm?token_hash=t&type=magiclink')
    expect(authLandingRedirect({ search: '?error=access_denied&error_code=otp_expired', hash: '' })).toBe(
      '/auth/confirm?error=access_denied&error_code=otp_expired'
    )
    expect(authLandingRedirect({ search: '', hash: '#error=access_denied&error_code=otp_expired' }, { signedIn: true })).toBe(
      '/auth/confirm#error=access_denied&error_code=otp_expired'
    )
  })

  it('leaves a ?code to supabase-js once signed in, and ordinary URLs alone', () => {
    expect(authLandingRedirect({ search: '?code=c', hash: '' })).toBe('/auth/confirm?code=c')
    expect(authLandingRedirect({ search: '?code=c', hash: '' }, { signedIn: true })).toBeNull()
    expect(authLandingRedirect({ search: '?utm_source=preply', hash: '#top' })).toBeNull()
    expect(authLandingRedirect({})).toBeNull()
  })
})

describe('fallback routing ignores the session’s stale approval flag (auth-4)', () => {
  it('sends a student the token still calls unapproved to /student (the proxy knows better)', () => {
    expect(fallbackDestination({ app_metadata: { role: 'student', approved: false } })).toBe('/student')
    expect(fallbackDestination({ app_metadata: { role: 'student' } }, '/student/lessons/1')).toBe('/student/lessons/1')
    expect(fallbackDestination({ app_metadata: { role: 'teacher' } })).toBe('/teacher')
    expect(fallbackDestination(null)).toBe('/student')
  })
})

describe('api() on 401 (auth-5)', () => {
  function browser(lang) {
    const jar = cookieJar(SESSION_COOKIES)
    globalThis.document = {
      documentElement: { lang },
      get cookie() {
        return jar.read()
      },
      set cookie(value) {
        jar.write(value)
      },
    }
    globalThis.window = { location: { pathname: '/teacher/lessons/1', search: '?tab=exercises', href: '' } }
    globalThis.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({ error: 'Unauthorized' }) }))
    return jar
  }

  it('clears the session, goes to /login, and asks again if the user stayed on the page', async () => {
    vi.useFakeTimers()
    const jar = browser('fr')
    const first = await api('/api/teacher/lessons/1', { method: 'PATCH', body: {} }).catch((err) => err)
    expect(first).toMatchObject({ status: 401, code: 'session_expired' })
    expect(first.message).toMatch(/^Ta session a expiré/)
    expect(window.location.href).toBe(`/login?next=${encodeURIComponent('/teacher/lessons/1?tab=exercises')}`)
    expect([...jar.cookies.keys()]).toEqual(['other'])

    // "Stay on this page": a later 401 sends the user to /login again
    window.location.href = ''
    await api('/api/teacher/lessons/1').catch(() => {})
    expect(window.location.href).toBe('')
    vi.advanceTimersByTime(1000)
    await api('/api/teacher/lessons/1').catch(() => {})
    expect(window.location.href).toMatch(/^\/login\?next=/)
    vi.advanceTimersByTime(1000)
  })

  it('explains it in English on student pages', async () => {
    browser('en')
    const err = await api('/api/student/lessons').catch((e) => e)
    expect(err.message).toMatch(/^Your session has expired/)
  })
})

describe('requireUser speaks the route’s language (auth-7, polish-4)', () => {
  function response() {
    return {
      statusCode: 0,
      body: null,
      status(code) {
        this.statusCode = code
        return this
      },
      json(body) {
        this.body = body
        return this
      },
    }
  }
  const req = { headers: {} }
  beforeEach(() => {
    fake.user = null
    fake.error = null
    fake.throws = false
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  it('answers an Auth outage in French on teacher and admin routes, in English elsewhere', async () => {
    fake.error = { name: 'AuthRetryableFetchError', status: 0 }
    const teacherRes = response()
    expect(await requireTeacher(req, teacherRes)).toBeNull()
    expect(teacherRes).toMatchObject({ statusCode: 503, body: { error: 'Service de connexion indisponible. Réessaie dans un instant.' } })
    const studentRes = response()
    await requireUser(req, studentRes)
    expect(studentRes.body.error).toBe('Sign-in service unavailable. Please try again in a moment.')
    fake.throws = true
    const adminRes = response()
    await requireAdmin(req, adminRes)
    expect(adminRes).toMatchObject({ statusCode: 503, body: { error: 'Service de connexion indisponible. Réessaie dans un instant.' } })
  })

  it('keeps the codes, translates the messages', async () => {
    fake.user = { id: 't', app_metadata: { role: 'teacher' }, banned_until: '2999-01-01T00:00:00Z' }
    const banned = response()
    await requireTeacher(req, banned)
    expect(banned).toMatchObject({ statusCode: 403, body: { error: 'Ce compte est suspendu.', code: 'banned' } })
    fake.user = null
    const expired = response()
    await requireAdmin(req, expired)
    expect(expired).toMatchObject({ statusCode: 401, body: { error: 'Ta session a expiré. Reconnecte-toi.' } })
    fake.user = { id: 's', app_metadata: { role: 'student', approved: false } }
    const pending = response()
    await requireUser(req, pending)
    expect(pending.body).toEqual({ error: 'Your account is waiting for your teacher’s approval.', code: 'pending' })
  })
})
