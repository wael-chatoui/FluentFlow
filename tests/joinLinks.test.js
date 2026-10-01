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
  revokeLinksOf,
} from '@/utils/api/joinLinks'
import {
  PLACEHOLDER_DOMAIN,
  deletePlaceholder,
  isPlaceholder,
  isPlaceholderEmail,
  isPlaceholderEmailShaped,
  placeholderEmail,
} from '@/utils/api/placeholders'
import { accountFields } from '@/utils/api/students'
import { parseEmail } from '@/utils/api/invites'
import { ACCOUNT_STATE_LABELS, accountState } from '@/components/teacher/format'
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
function fakeAdmin({ links = [], profiles = [], users = [], rpc = null } = {}) {
  const tables = { join_links: links, profiles }
  const updatedUsers = []
  const createdUsers = []
  const deletedUsers = []
  const rpcCalls = []
  const authUsers = new Map(users.map((u) => [u.id, u]))
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
      neq: (col, v) => (filters.push((r) => r[col] !== v), builder),
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
    createdUsers,
    deletedUsers,
    rpcCalls,
    from: query,
    rpc: async (name, args) => {
      rpcCalls.push({ name, args })
      return { data: rpc ? rpc(args) : null, error: null }
    },
    auth: {
      admin: {
        updateUserById: async (id, attrs) => {
          updatedUsers.push({ id, ...attrs })
          return { data: { user: { id, ...attrs } }, error: null }
        },
        createUser: async (attrs) => {
          const user = { id: `ph-${createdUsers.length + 1}`, ...attrs }
          createdUsers.push(user)
          authUsers.set(user.id, user)
          // Like the DB trigger: a profile with the (fake) address
          tables.profiles.push({ id: user.id, email: attrs.email, full_name: attrs.user_metadata?.full_name || null })
          return { data: { user }, error: null }
        },
        getUserById: async (id) =>
          authUsers.has(id)
            ? { data: { user: authUsers.get(id) }, error: null }
            : { data: { user: null }, error: { status: 404, message: 'User not found' } },
        deleteUser: async (id) => {
          deletedUsers.push(id)
          authUsers.delete(id)
          return { data: null, error: null }
        },
      },
    },
  }
}

const NOW = Date.parse('2026-09-30T12:00:00Z')
const DAY = 24 * 60 * 60 * 1000
const student = (meta = {}) => ({ id: 'u-1', email: 's@example.com', app_metadata: { role: 'student', approved: false, ...meta } })

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

describe('placeholder students', () => {
  it('makes unique fake addresses on the reserved .invalid domain', () => {
    const a = placeholderEmail()
    expect(a).toMatch(/^invite-[0-9a-f]{24}@placeholder\.invalid$/)
    expect(a).not.toBe(placeholderEmail())
    expect(isPlaceholderEmailShaped(a)).toBe(true)
    expect(isPlaceholderEmail(a.toUpperCase())).toBe(true)
    expect(isPlaceholderEmail(`x@${PLACEHOLDER_DOMAIN}.com`)).toBe(false)
    expect(isPlaceholderEmail('anxhela@example.com')).toBe(false)
    expect(isPlaceholderEmail(null)).toBe(false)
  })

  it('is flagged in app_metadata only, and shown as « Invitation en attente »', () => {
    const ph = { id: 'p', app_metadata: { role: 'student', approved: true, placeholder: true } }
    expect(isPlaceholder(ph)).toBe(true)
    expect(isPlaceholder({ app_metadata: { role: 'student' }, user_metadata: { placeholder: true } })).toBe(false)
    expect(accountFields(ph)).toMatchObject({ approved: true, placeholder: true })
    const student = { placeholder: true, last_sign_in_at: null, onboarded_at: null }
    expect(accountState(student)).toBe('placeholder')
    expect(ACCOUNT_STATE_LABELS.placeholder.label).toBe('Invitation en attente')
    expect(accountState({ last_sign_in_at: null })).toBe('invited')
  })

  it('never takes a placeholder address for an invitation', () => {
    expect(() => parseEmail(placeholderEmail())).toThrow('Adresse e-mail invalide.')
    expect(parseEmail(' Anxhela@Example.com ')).toBe('anxhela@example.com')
  })

  it('deletes only accounts flagged as placeholders', async () => {
    const admin = fakeAdmin({
      users: [
        { id: 'ph', app_metadata: { role: 'student', approved: true, placeholder: true } },
        { id: 'real', app_metadata: { role: 'student', approved: true } },
      ],
    })
    expect(await deletePlaceholder(admin, 'real')).toBe(false)
    expect(await deletePlaceholder(admin, 'ph')).toBe(true)
    expect(await deletePlaceholder(admin, 'gone')).toBe(true)
    expect(admin.deletedUsers).toEqual(['ph'])
  })
})

describe('createJoinLink / findUsableLink', () => {
  it('creates the placeholder student, stores only the hash, expires in 14 days', async () => {
    const admin = fakeAdmin()
    const { token, link, row, studentId } = await createJoinLink(admin, { label: ' Kiren ', createdBy: 't-1', origin: 'https://app.test', now: NOW })
    expect(link).toBe(`https://app.test/join/${token}`)
    // Placeholder: approved student, fake address, the name in the profile but no email
    expect(admin.createdUsers).toHaveLength(1)
    const [created] = admin.createdUsers
    expect(studentId).toBe(created.id)
    expect(created).toMatchObject({ email_confirm: true, app_metadata: { role: 'student', approved: true, placeholder: true }, user_metadata: { full_name: 'Kiren' } })
    expect(isPlaceholderEmailShaped(created.email)).toBe(true)
    expect(admin.tables.profiles.find((p) => p.id === studentId)).toMatchObject({ email: null, full_name: 'Kiren' })

    const stored = admin.tables.join_links[0]
    expect(stored).toMatchObject({ token_hash: hashToken(token), label: 'Kiren', student_id: studentId })
    expect(JSON.stringify(stored)).not.toContain(token)
    expect(Date.parse(row.expires_at) - NOW).toBe(JOIN_LINK_TTL_DAYS * DAY)
    expect((await findUsableLink(admin, token, NOW)).link?.label).toBe('Kiren')
    expect((await findUsableLink(admin, generateToken(), NOW)).reason).toBe('unknown')
    expect((await findUsableLink(admin, 'not a token', NOW)).reason).toBe('unknown')
    expect((await findUsableLink(admin, token, NOW + 15 * DAY)).reason).toBe('expired')
  })

  it('requires a first name, and reuses an existing placeholder', async () => {
    const admin = fakeAdmin()
    await expect(createJoinLink(admin, { label: '  ', createdBy: 't-1', origin: 'https://app.test' })).rejects.toMatchObject({ status: 400 })
    expect(admin.createdUsers).toEqual([])

    const first = await createJoinLink(admin, { label: 'Kiren', createdBy: 't-1', origin: 'https://app.test', now: NOW })
    const second = await createJoinLink(admin, { label: 'Kiren', studentId: first.studentId, createdBy: 't-1', origin: 'https://app.test', now: NOW })
    expect(second.studentId).toBe(first.studentId)
    expect(admin.createdUsers).toHaveLength(1)
    // « Nouveau lien d'invitation »: the older link stops working, the new one stays
    expect(await revokeLinksOf(admin, first.studentId, { exceptId: second.row.id, now: NOW })).toEqual([first.row.id])
    expect((await findUsableLink(admin, first.token, NOW)).reason).toBe('revoked')
    expect((await findUsableLink(admin, second.token, NOW)).link).toBeTruthy()
  })
})

describe('claimJoinLink', () => {
  let token
  beforeEach(() => {
    token = generateToken()
  })
  const ok = (extra = {}) => () => ({ ok: true, already_claimed: false, link_id: 'l-1', label: 'Anxhela', placeholder_id: null, lessons: 0, ...extra })
  const placeholderUser = { id: 'ph-1', app_metadata: { role: 'student', approved: true, placeholder: true } }

  it('calls claim_join_link with the hash, approves the account and deletes the placeholder', async () => {
    const admin = fakeAdmin({ users: [placeholderUser], rpc: ok({ placeholder_id: 'ph-1', lessons: 3 }) })
    const result = await claimJoinLink(admin, token, student())
    expect(admin.rpcCalls).toEqual([{ name: 'claim_join_link', args: { p_token_hash: hashToken(token), p_user: 'u-1' } }])
    expect(result).toEqual({ link: { id: 'l-1', label: 'Anxhela' }, alreadyClaimed: false, placeholderId: 'ph-1', lessons: 3 })
    expect(admin.updatedUsers).toEqual([{ id: 'u-1', app_metadata: { role: 'student', approved: true } }])
    expect(admin.deletedUsers).toEqual(['ph-1'])
  })

  it('never deletes an account that is not a placeholder', async () => {
    const admin = fakeAdmin({ users: [{ id: 'x', app_metadata: { role: 'student' } }], rpc: ok({ placeholder_id: 'x' }) })
    await claimJoinLink(admin, token, student())
    expect(admin.deletedUsers).toEqual([])
  })

  it('names the profile from the label for a link without placeholder (created before them)', async () => {
    const admin = fakeAdmin({ profiles: [{ id: 'u-1', full_name: null }], rpc: ok() })
    await claimJoinLink(admin, token, student())
    expect(admin.tables.profiles[0].full_name).toBe('Anxhela')
    const kept = fakeAdmin({ profiles: [{ id: 'u-1', full_name: 'Anxhela K.' }], rpc: ok() })
    await claimJoinLink(kept, token, student())
    expect(kept.tables.profiles[0].full_name).toBe('Anxhela K.')
  })

  it('is idempotent for the same user', async () => {
    const admin = fakeAdmin({ rpc: ok({ already_claimed: true }) })
    const result = await claimJoinLink(admin, token, student({ approved: true }))
    expect(result.alreadyClaimed).toBe(true)
    expect(admin.updatedUsers).toEqual([])
  })

  it('maps the refusals of claim_join_link to English errors', async () => {
    for (const [reason, status] of [['used', 410], ['expired', 410], ['revoked', 410], ['unknown', 404], ['not_student', 409], ['weird', 404]]) {
      const admin = fakeAdmin({ rpc: () => ({ ok: false, reason }) })
      const code = CLAIM_ERRORS[reason] ? reason : 'unknown'
      await expect(claimJoinLink(admin, token, student())).rejects.toMatchObject({ code, status, message: CLAIM_ERRORS[code] })
      expect(admin.updatedUsers).toEqual([])
    }
    const admin = fakeAdmin({ rpc: ok() })
    await expect(claimJoinLink(admin, 'not a token', student())).rejects.toMatchObject({ code: 'unknown', status: 404 })
    expect(admin.rpcCalls).toEqual([])
  })

  it('never claims with a teacher, admin or placeholder account', async () => {
    const admin = fakeAdmin({ rpc: ok() })
    await expect(claimJoinLink(admin, token, { id: 't', app_metadata: { role: 'teacher' } })).rejects.toMatchObject({ code: 'not_student', status: 409 })
    await expect(claimJoinLink(admin, token, student({ is_admin: true }))).rejects.toMatchObject({ code: 'not_student' })
    await expect(claimJoinLink(admin, token, placeholderUser)).rejects.toMatchObject({ code: 'not_student' })
    expect(admin.rpcCalls).toEqual([])
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
