import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import {
  CLAIM_ERRORS,
  JOIN_LINK_TTL_DAYS,
  claimJoinLink,
  createJoinLink,
  findUsableLink,
  generateToken,
  hashToken,
  isTokenShaped,
  joinLinkStatus,
  joinMessage,
  joinUrl,
} from '@/utils/api/joinLinks'
import { pathAfterSignIn } from '@/utils/auth/routing'

// ---- Fake Supabase for the proxy (signed-out visitor) ----
const fake = { user: null }
vi.mock('@supabase/ssr', () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: fake.user }, error: null }) } }),
}))
vi.mock('@/utils/supabase/admin', () => ({
  createAdminClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  }),
}))

// ---- Minimal in-memory service-role client for join_links / profiles ----
function fakeAdmin({ links = [], profiles = [] } = {}) {
  const tables = { join_links: links, profiles }
  const updatedUsers = []
  const query = (table) => {
    const filters = []
    let op = { kind: 'select' }
    const rows = () => tables[table].filter((r) => filters.every((f) => f(r)))
    const run = () => {
      if (op.kind === 'insert') {
        const row = { id: `id-${tables[table].length + 1}`, created_at: new Date().toISOString(), used_at: null, used_by: null, revoked_at: null, ...op.values }
        tables[table].push(row)
        return { data: [row], error: null }
      }
      if (op.kind === 'update') {
        const hit = rows()
        hit.forEach((r) => Object.assign(r, op.values))
        return { data: hit.map((r) => ({ ...r })), error: null }
      }
      if (op.kind === 'upsert') {
        const existing = tables[table].find((r) => r.id === op.values.id)
        if (existing) Object.assign(existing, op.values)
        else tables[table].push({ ...op.values })
        return { data: null, error: null }
      }
      return { data: rows().map((r) => ({ ...r })), error: null }
    }
    const builder = {
      select: () => builder,
      insert: (values) => ((op = { kind: 'insert', values }), builder),
      update: (values) => ((op = { kind: 'update', values }), builder),
      upsert: (values) => ((op = { kind: 'upsert', values }), builder),
      eq: (col, v) => (filters.push((r) => r[col] === v), builder),
      is: (col, v) => (filters.push((r) => (r[col] ?? null) === v), builder),
      gt: (col, v) => (filters.push((r) => Date.parse(r[col]) > Date.parse(v)), builder),
      single: async () => ({ data: run().data[0], error: null }),
      maybeSingle: async () => ({ data: run().data?.[0] ?? null, error: null }),
      then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
    }
    return builder
  }
  return {
    tables,
    updatedUsers,
    from: query,
    auth: {
      admin: {
        updateUserById: async (id, attrs) => {
          updatedUsers.push({ id, ...attrs })
          return { data: { user: { id, ...attrs } }, error: null }
        },
      },
    },
  }
}

const NOW = Date.parse('2026-09-30T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const student = (meta = {}) => ({ id: 'u-1', email: 's@example.com', app_metadata: { role: 'student', approved: false, ...meta } })

function linkRow(token, extra = {}) {
  return {
    id: 'l-1',
    token_hash: hashToken(token),
    label: 'Anxhela',
    created_by: 't-1',
    created_at: new Date(NOW - DAY).toISOString(),
    expires_at: new Date(NOW + 13 * DAY).toISOString(),
    used_at: null,
    used_by: null,
    revoked_at: null,
    ...extra,
  }
}

describe('token helpers', () => {
  it('makes 43-character base64url tokens, all different', () => {
    const a = generateToken()
    const b = generateToken()
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(a).not.toBe(b)
    expect(isTokenShaped(a)).toBe(true)
    expect(isTokenShaped('short')).toBe(false)
    expect(isTokenShaped(`${a}=`)).toBe(false)
    expect(isTokenShaped(undefined)).toBe(false)
  })

  it('hashes with SHA-256 (hex), deterministically', () => {
    expect(hashToken('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    const token = generateToken()
    expect(hashToken(token)).toBe(hashToken(token))
    expect(hashToken(token)).not.toContain(token)
  })

  it('builds the public link and an English message without emojis', () => {
    expect(joinUrl('https://app.test', 'tok')).toBe('https://app.test/join/tok')
    const message = joinMessage({ label: 'Anxhela Doe', link: 'https://app.test/join/tok', teacherName: 'Wael' })
    expect(message).toMatch(/^Hi Anxhela!/)
    expect(message).toContain('https://app.test/join/tok')
    expect(message).toContain(`${JOIN_LINK_TTL_DAYS} days`)
    expect(message).not.toMatch(/\p{Extended_Pictographic}/u)
    expect(joinMessage({ link: 'x' })).toMatch(/^Hi!/)
  })
})

describe('joinLinkStatus', () => {
  it('is used, revoked, expired or active, in that order', () => {
    const base = { expires_at: new Date(NOW + DAY).toISOString() }
    expect(joinLinkStatus(base, NOW)).toBe('active')
    expect(joinLinkStatus({ ...base, used_at: 'x', revoked_at: 'y' }, NOW)).toBe('used')
    expect(joinLinkStatus({ ...base, revoked_at: 'y' }, NOW)).toBe('revoked')
    expect(joinLinkStatus({ expires_at: new Date(NOW - 1).toISOString() }, NOW)).toBe('expired')
    expect(joinLinkStatus({ expires_at: new Date(NOW).toISOString() }, NOW)).toBe('expired')
    expect(joinLinkStatus({}, NOW)).toBe('expired')
  })
})

describe('createJoinLink / findUsableLink', () => {
  it('stores only the hash, expires in 14 days, and finds the link by token', async () => {
    const admin = fakeAdmin()
    const { token, link, row } = await createJoinLink(admin, { label: 'Kiren', createdBy: 't-1', origin: 'https://app.test', now: NOW })
    expect(link).toBe(`https://app.test/join/${token}`)
    const stored = admin.tables.join_links[0]
    expect(stored.token_hash).toBe(hashToken(token))
    expect(JSON.stringify(stored)).not.toContain(token)
    expect(Date.parse(row.expires_at) - NOW).toBe(JOIN_LINK_TTL_DAYS * DAY)
    expect((await findUsableLink(admin, token, NOW)).link?.label).toBe('Kiren')
    expect((await findUsableLink(admin, generateToken(), NOW)).reason).toBe('unknown')
    expect((await findUsableLink(admin, 'not a token', NOW)).reason).toBe('unknown')
    expect((await findUsableLink(admin, token, NOW + 15 * DAY)).reason).toBe('expired')
  })
})

describe('claimJoinLink', () => {
  let token
  beforeEach(() => {
    token = generateToken()
  })

  it('spends the link, approves the account (role unchanged) and names the profile', async () => {
    const admin = fakeAdmin({ links: [linkRow(token)], profiles: [{ id: 'u-1', full_name: null }] })
    const result = await claimJoinLink(admin, token, student(), NOW)
    expect(result.alreadyClaimed).toBe(false)
    expect(admin.tables.join_links[0]).toMatchObject({ used_by: 'u-1' })
    expect(admin.updatedUsers).toEqual([{ id: 'u-1', app_metadata: { role: 'student', approved: true } }])
    expect(admin.tables.profiles[0].full_name).toBe('Anxhela')
  })

  it('keeps an existing profile name', async () => {
    const admin = fakeAdmin({ links: [linkRow(token)], profiles: [{ id: 'u-1', full_name: 'Anxhela K.' }] })
    await claimJoinLink(admin, token, student(), NOW)
    expect(admin.tables.profiles[0].full_name).toBe('Anxhela K.')
  })

  it('is idempotent for the same user', async () => {
    const admin = fakeAdmin({ links: [linkRow(token, { used_at: new Date(NOW).toISOString(), used_by: 'u-1' })] })
    const result = await claimJoinLink(admin, token, student({ approved: true }), NOW + 20 * DAY)
    expect(result.alreadyClaimed).toBe(true)
    expect(admin.updatedUsers).toEqual([])
  })

  it('refuses a link used by someone else, expired, revoked or unknown', async () => {
    const cases = [
      [linkRow(token, { used_at: new Date(NOW).toISOString(), used_by: 'u-2' }), 'used', 410],
      [linkRow(token, { expires_at: new Date(NOW - 1).toISOString() }), 'expired', 410],
      [linkRow(token, { revoked_at: new Date(NOW).toISOString() }), 'revoked', 410],
    ]
    for (const [row, code, status] of cases) {
      const admin = fakeAdmin({ links: [row] })
      await expect(claimJoinLink(admin, token, student(), NOW)).rejects.toMatchObject({ code, status, message: CLAIM_ERRORS[code] })
      expect(admin.updatedUsers).toEqual([])
    }
    await expect(claimJoinLink(fakeAdmin(), token, student(), NOW)).rejects.toMatchObject({ code: 'unknown', status: 404 })
  })

  it('never claims with a teacher or admin account', async () => {
    const admin = fakeAdmin({ links: [linkRow(token)] })
    await expect(claimJoinLink(admin, token, { id: 't', app_metadata: { role: 'teacher' } }, NOW)).rejects.toMatchObject({ code: 'not_student', status: 409 })
    await expect(claimJoinLink(admin, token, student({ is_admin: true }), NOW)).rejects.toMatchObject({ code: 'not_student' })
    expect(admin.tables.join_links[0].used_at).toBeNull()
  })
})

describe('routing for join links', () => {
  it('brings a new (pending) student back to the join page after sign-in', () => {
    expect(pathAfterSignIn({ role: 'student', approved: false, next: '/join/abc' })).toBe('/join/abc')
    expect(pathAfterSignIn({ role: 'teacher', next: '/join/abc' })).toBe('/teacher')
  })

  it('keeps /join public in the proxy, also on the back-office host', async () => {
    const { proxy } = await import('@/proxy')
    fake.user = null
    for (const host of ['app.test', 'backoffice.localhost']) {
      const res = await proxy(new NextRequest(`http://${host}/join/abc`, { headers: { host } }))
      expect(res.headers.get('location')).toBeNull()
    }
  })
})
