import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { establishSession, readLandingParams } from '@/components/auth/landing'
import { failureFromAuthError, failureFromUrl } from '@/components/auth/failures'

// Minimal browser globals for the landing helpers (URL + history only)
function setUrl(href) {
  globalThis.window = {
    location: { href },
    history: { state: { __N: true, url: '/x', as: '/x' }, replaceState: vi.fn() },
  }
}

const jwt = (sub) => `h.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.s`

// linkUser: the account the link signs in (verifyOtp / setSession answer with it)
function fakeSupabase({ session = null, initError = null, verifyError = null, setError = null, linkUser = { id: 'link-user', email: 'l@example.com' } } = {}) {
  return {
    auth: {
      initialize: vi.fn(async () => ({ error: initError })),
      getSession: vi.fn(async () => ({ data: { session } })),
      verifyOtp: vi.fn(async () => (verifyError ? { data: {}, error: verifyError } : { data: { user: linkUser }, error: null })),
      setSession: vi.fn(async () => (setError ? { data: {}, error: setError } : { data: { user: linkUser }, error: null })),
    },
  }
}

// Link-confirmation cookie (utils/auth/linkConfirm.js), in memory
function fakeGate(pendingFor = null) {
  const gate = {
    pendingFor,
    isPending: (id) => gate.pendingFor === id,
    require: vi.fn((id) => {
      gate.pendingFor = id
    }),
    clear: vi.fn(() => {
      gate.pendingFor = null
    }),
  }
  return gate
}

beforeEach(() => setUrl('http://app.test/auth/confirm'))
afterEach(() => {
  delete globalThis.window
})

describe('readLandingParams', () => {
  it('reads the token and removes it from the address bar at once', () => {
    setUrl('http://app.test/auth/confirm?token_hash=abc&type=invite&next=%2Fstudent%2Freview')
    const params = readLandingParams()
    expect(params).toMatchObject({ tokenHash: 'abc', type: 'invite', next: '/student/review', path: '/auth/confirm' })
    expect(window.history.replaceState).toHaveBeenCalledWith(expect.objectContaining({ as: '/auth/confirm' }), '', '/auth/confirm')
  })

  it('reads implicit tokens from the hash', () => {
    setUrl('http://app.test/auth/confirm#access_token=a.b.c&refresh_token=r&type=invite')
    expect(readLandingParams()).toMatchObject({ accessToken: 'a.b.c', refreshToken: 'r', type: 'invite' })
  })

  it('leaves a PKCE code in place for supabase-js, drops an unsafe next', () => {
    setUrl('http://app.test/auth/callback?code=xyz&next=%2F%2Fevil.com')
    const params = readLandingParams()
    expect(params).toMatchObject({ code: 'xyz', next: null })
    expect(window.history.replaceState).not.toHaveBeenCalled()
  })
})

describe('establishSession', () => {
  it('maps URL errors to fixed failures, whatever the description says', async () => {
    const supabase = fakeSupabase()
    const params = { error: 'access_denied', errorCode: 'otp_expired' }
    expect(await establishSession(supabase, params)).toEqual({ failure: 'expired' })
    expect(await establishSession(supabase, { error: 'access_denied' })).toEqual({ failure: 'cancelled' })
    expect(await establishSession(supabase, { error: 'server_error', errorCode: 'weird' })).toEqual({ failure: 'generic' })
    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled()
  })

  it('verifies a token hash when nobody is signed in, then has the user confirm the account', async () => {
    const supabase = fakeSupabase()
    const gate = fakeGate()
    expect(await establishSession(supabase, { tokenHash: 'abc', type: 'invite' }, { gate })).toEqual({ confirmAs: 'l@example.com' })
    expect(supabase.auth.verifyOtp).toHaveBeenCalledWith({ token_hash: 'abc', type: 'invite' })
    expect(gate.require).toHaveBeenCalledWith('link-user')
  })

  it('rejects unknown link types', async () => {
    const supabase = fakeSupabase()
    expect(await establishSession(supabase, { tokenHash: 'abc', type: 'email_change' })).toEqual({ failure: 'invalid' })
    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled()
  })

  it('asks before replacing another signed-in account, then continues when forced', async () => {
    const supabase = fakeSupabase({ session: { user: { id: 'teacher', email: 't@example.com' } } })
    const params = { tokenHash: 'abc', type: 'invite' }
    const gate = fakeGate()
    expect(await establishSession(supabase, params, { gate })).toEqual({ signedInAs: 't@example.com' })
    expect(supabase.auth.verifyOtp).not.toHaveBeenCalled()
    expect(await establishSession(supabase, params, { force: true, gate })).toEqual({ confirmAs: 'l@example.com' })
    expect(supabase.auth.verifyOtp).toHaveBeenCalledTimes(1)
  })

  it('does not ask when the implicit tokens belong to the signed-in user', async () => {
    const me = { id: 'u-1', email: 's@example.com' }
    const supabase = fakeSupabase({ session: { user: me }, linkUser: me })
    const gate = fakeGate()
    expect(await establishSession(supabase, { accessToken: jwt('u-1'), refreshToken: 'r' }, { gate })).toBeNull()
    expect(supabase.auth.setSession).toHaveBeenCalledWith({ access_token: jwt('u-1'), refresh_token: 'r' })
    expect(gate.require).not.toHaveBeenCalled()
    expect(await establishSession(supabase, { accessToken: jwt('u-2'), refreshToken: 'r' }, { gate })).toEqual({ signedInAs: 's@example.com' })
  })

  it('reports an expired or used link', async () => {
    const supabase = fakeSupabase({ verifyError: { name: 'AuthApiError', status: 403, code: 'otp_expired' } })
    expect(await establishSession(supabase, { tokenHash: 'abc', type: 'magiclink' })).toEqual({ failure: 'expired' })
  })

  it('handles a PKCE code: signed in, other browser, or failed exchange', async () => {
    expect(await establishSession(fakeSupabase({ session: { user: { id: 'u' } } }), { code: 'c', path: '/auth/callback' })).toBeNull()
    expect(await establishSession(fakeSupabase(), { code: 'c', path: '/auth/callback' })).toEqual({ failure: 'other_browser' })
    const expired = fakeSupabase({ initError: { name: 'AuthApiError', status: 404, code: 'flow_state_not_found' } })
    expect(await establishSession(expired, { code: 'c', path: '/auth/callback' })).toEqual({ failure: 'expired' })
    const offline = fakeSupabase({ initError: { name: 'AuthRetryableFetchError', status: 0 } })
    expect(await establishSession(offline, { code: 'c', path: '/auth/callback' })).toEqual({ failure: 'generic' })
  })

  it('accepts a reload of the cleaned URL only when already signed in', async () => {
    expect(await establishSession(fakeSupabase({ session: { user: { id: 'u' } } }), {})).toBeNull()
    expect(await establishSession(fakeSupabase(), {})).toEqual({ failure: 'invalid' })
  })
})

describe('failure mapping', () => {
  it('maps supabase-js errors', () => {
    expect(failureFromAuthError({ name: 'AuthRetryableFetchError', status: 0 })).toBe('unavailable')
    expect(failureFromAuthError({ name: 'AuthPKCECodeVerifierMissingError', code: 'pkce_code_verifier_not_found' })).toBe('other_browser')
    expect(failureFromAuthError({ name: 'AuthApiError', code: 'user_banned' })).toBe('banned')
    expect(failureFromAuthError({ name: 'AuthApiError', code: 'something_new' })).toBe('generic')
  })

  it('maps provider errors', () => {
    expect(failureFromUrl({ error: 'access_denied', errorCode: 'signup_disabled' })).toBe('no_account')
    expect(failureFromUrl({ error: 'invalid_request' })).toBe('generic')
  })
})
