import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

// Fake Supabase: the signed-in user (or null) and the student's profile
const fake = { user: null, error: null, profile: null, profileReads: 0 }

vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: fake.user }, error: fake.error }) } }),
}))
vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => {
            fake.profileReads += 1
            return { data: fake.profile, error: null }
          },
        }),
      }),
    }),
  }),
}))

const { proxy } = await import('@/proxy')

const student = (meta = {}) => ({ id: 'u-1', email: 's@example.com', app_metadata: { role: 'student', ...meta } })
const teacher = (meta = {}) => ({ id: 't-1', email: 't@example.com', app_metadata: { role: 'teacher', ...meta } })

async function visit(path, { host = 'app.test', cookie } = {}) {
  const headers = { host }
  if (cookie) headers.cookie = cookie
  const res = await proxy(new NextRequest(`http://${host}${path}`, { headers }))
  const location = res.headers.get('location')
  return { location: location ? location.replace(/^http:\/\/[^/]+/, '') : null, res }
}

beforeEach(() => {
  fake.user = null
  fake.error = null
  fake.profile = { onboarded_at: '2026-01-01T00:00:00Z' }
  fake.profileReads = 0
})

describe('proxy — signed out', () => {
  it('lets public and auth pages through', async () => {
    for (const path of ['/', '/login', '/logout', '/auth/callback', '/auth/confirm', '/admin/forbidden']) {
      expect((await visit(path)).location).toBeNull()
    }
  })

  it('sends protected pages to /login with the page as next', async () => {
    expect((await visit('/teacher/lessons/abc?tab=exercises')).location).toBe(
      `/login?next=${encodeURIComponent('/teacher/lessons/abc?tab=exercises')}`
    )
    expect((await visit('/student')).location).toBe(`/login?next=${encodeURIComponent('/student')}`)
  })

  it('sends /pending to a bare /login', async () => {
    expect((await visit('/pending')).location).toBe('/login')
  })
})

describe('proxy — back-office host', () => {
  it('keeps everything but shared paths inside /admin', async () => {
    const host = 'backoffice.localhost:3000'
    expect((await visit('/', { host })).location).toBe('/admin')
    expect((await visit('/student', { host })).location).toBe('/admin')
    expect((await visit('/logout', { host })).location).toBeNull()
    expect((await visit('/auth/confirm', { host })).location).toBeNull()
    expect((await visit('/admin/users', { host })).location).toBe(`/login?next=${encodeURIComponent('/admin/users')}`)
  })

  it('sends non-admins to the forbidden page', async () => {
    fake.user = teacher()
    expect((await visit('/admin', { host: 'backoffice.localhost' })).location).toBe('/admin/forbidden')
    fake.user = teacher({ is_admin: true })
    expect((await visit('/admin', { host: 'backoffice.localhost' })).location).toBeNull()
  })
})

describe('proxy — accounts waiting for approval', () => {
  it('only sees /pending', async () => {
    fake.user = student({ approved: false })
    expect((await visit('/student')).location).toBe('/pending')
    expect((await visit('/onboarding')).location).toBe('/pending')
    expect((await visit('/teacher')).location).toBe('/pending')
    expect((await visit('/pending')).location).toBeNull()
  })

  it('leaves /pending once approved (teachers are never pending)', async () => {
    fake.user = student({ approved: true })
    expect((await visit('/pending')).location).toBe('/')
    fake.user = student()
    expect((await visit('/pending')).location).toBe('/')
    fake.user = teacher({ approved: false })
    expect((await visit('/teacher')).location).toBeNull()
  })
})

describe('proxy — roles and onboarding', () => {
  it('keeps teachers and students in their own areas', async () => {
    fake.user = student()
    expect((await visit('/teacher')).location).toBe('/student')
    fake.user = teacher()
    expect((await visit('/student/lessons')).location).toBe('/teacher')
    expect((await visit('/onboarding')).location).toBe('/teacher')
  })

  it('sends students who have not onboarded to /onboarding from any student page', async () => {
    fake.user = student()
    fake.profile = { onboarded_at: null }
    expect((await visit('/student/review')).location).toBe('/onboarding')
    expect((await visit('/onboarding')).location).toBeNull()
  })

  it('remembers a finished onboarding in a cookie for this user only', async () => {
    fake.user = student()
    const first = await visit('/student/vocabulary')
    expect(first.location).toBeNull()
    expect(first.res.cookies.get('pl-onboarded')?.value).toBe('u-1')
    expect(fake.profileReads).toBe(1)

    await visit('/student', { cookie: 'pl-onboarded=u-1' })
    expect(fake.profileReads).toBe(1)

    fake.profile = { onboarded_at: null }
    expect((await visit('/student', { cookie: 'pl-onboarded=someone-else' })).location).toBe('/onboarding')
  })
})

describe('proxy — outages and suspended accounts', () => {
  it('lets the page load when Supabase Auth is unreachable (no /login loop)', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    fake.error = { name: 'AuthRetryableFetchError', status: 0 }
    expect((await visit('/student/review')).location).toBeNull()
    fake.error = { name: 'AuthApiError', status: 502 }
    expect((await visit('/teacher')).location).toBeNull()
    spy.mockRestore()
  })

  it('still sends a rejected session to /login', async () => {
    fake.error = { name: 'AuthApiError', status: 403, code: 'user_not_found' }
    expect((await visit('/student')).location).toBe(`/login?next=${encodeURIComponent('/student')}`)
  })

  it('sends a suspended account to /login, which explains it', async () => {
    fake.user = { ...student(), banned_until: '2999-01-01T00:00:00Z' }
    expect((await visit('/student')).location).toBe('/login')
    fake.user = { ...student(), banned_until: '2000-01-01T00:00:00Z' }
    expect((await visit('/student')).location).toBeNull()
  })

  it('keeps an admin waiting for approval out of the back office (its API refuses them)', async () => {
    fake.user = student({ approved: false, is_admin: true })
    expect((await visit('/admin')).location).toBe('/pending')
  })
})
