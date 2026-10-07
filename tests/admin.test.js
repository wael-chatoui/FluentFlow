import { describe, expect, it } from 'vitest'
import { BadRequest, HttpError } from '@/utils/api/errors'
import { assertJsonBody } from '@/utils/api/admin/guard'
import { ilikeAny, lastPage, parsePagination, selectAll, selectPage, unavailableTable } from '@/utils/api/admin/query'
import {
  accessState,
  assertPrivilegesRemain,
  losesPrivileges,
  matchesRole,
  nameOf,
  sortUserItems,
  userListItem,
} from '@/utils/api/admin/users'
import { aiLedgerSummary, aiUsageSummary, dailyCounts, financeSummary, lastDays } from '@/utils/api/admin/stats'
import { formatEur } from '@/components/admin/common/format'
import { contentProblems, exercisesResetProgress, invalidExercisePositions } from '@/utils/api/admin/lessonEdit'
import { TABLES, formatRow, parseSort, readTablePage, searchFilter } from '@/utils/api/admin/tables'
import { normalizeExercisesForEdit } from '@/utils/lesson/schema'
import {
  exercisesResetProgress as draftResetsProgress,
  mergeAfterSave,
  toDraft,
  validateDraft,
} from '@/components/admin/lessons/editorModel'

const FUTURE = new Date(Date.now() + 86_400_000).toISOString()
const account = (id, meta = {}, extra = {}) => ({ id, email: `${id}@x.fr`, app_metadata: meta, ...extra })

const mcq = (id, choices = ['va', 'vais', 'vont'], answer = 1) => ({
  id,
  type: 'mcq',
  prompt: 'Choose',
  sentence: 'Je ___ au marché.',
  choices,
  answer,
  explanation: '',
})

describe('assertJsonBody', () => {
  const req = (method, headers = {}) => ({ method, headers })

  it('accepts JSON writes and reads', () => {
    expect(() => assertJsonBody(req('GET'))).not.toThrow()
    expect(() => assertJsonBody(req('PATCH', { 'content-type': 'application/json; charset=utf-8' }))).not.toThrow()
    expect(() => assertJsonBody(req('DELETE'))).not.toThrow()
  })

  it('refuses form bodies and body-less POSTs with 415', () => {
    for (const r of [
      req('POST', { 'content-type': 'application/x-www-form-urlencoded' }),
      req('POST', { 'content-type': 'text/plain' }),
      req('POST'),
      req('DELETE', { 'content-type': 'multipart/form-data; boundary=x', 'content-length': '20' }),
    ]) {
      let error
      try {
        assertJsonBody(r)
      } catch (err) {
        error = err
      }
      expect(error).toBeInstanceOf(HttpError)
      expect(error.status).toBe(415)
    }
  })
})

describe('pagination helpers', () => {
  it('parses and bounds page / perPage', () => {
    expect(parsePagination({ page: '3', perPage: '10' })).toEqual({ page: 3, perPage: 10, from: 20, to: 29 })
    expect(parsePagination({ page: '-2', perPage: '999' })).toMatchObject({ page: 1, perPage: 200 })
    expect(lastPage(0, 50)).toBe(1)
    expect(lastPage(101, 50)).toBe(3)
  })
})

describe('ilikeAny', () => {
  it('quotes the value and escapes LIKE wildcards', () => {
    expect(ilikeAny(['title'], 'a,b (c)')).toBe('title.ilike."%a,b (c)%"')
    expect(ilikeAny(['title'], '50%')).toBe('title.ilike."%50\\\\%%"')
    expect(ilikeAny(['a', 'b'], 'x_y')).toBe('a.ilike."%x\\\\_y%",b.ilike."%x\\\\_y%"')
    expect(ilikeAny(['title'], 'say "hi"')).toBe('title.ilike."%say \\"hi\\"%"')
  })

  it('turns * (a PostgREST wildcard that cannot be escaped) into a single-character match', () => {
    expect(ilikeAny(['title'], 'a*b')).toBe('title.ilike."%a_b%"')
  })
})

// Minimal PostgREST-like query: rows, a max-rows cap, and exact counts
function fakeTable(rows, { maxRows = 1000 } = {}) {
  return (options = {}) => ({
    range(from, to) {
      if (options.count && from > 0 && from >= rows.length) {
        return Promise.resolve({ data: null, count: null, error: { code: 'PGRST103' } })
      }
      const data = rows.slice(from, Math.min(to + 1, from + maxRows))
      return Promise.resolve({ data, count: options.count ? rows.length : null, error: null })
    },
    then(resolve) {
      // head: true count
      return Promise.resolve({ data: null, count: rows.length, error: null }).then(resolve)
    },
  })
}

describe('unavailableTable', () => {
  it('tells a missing 0006 table from one not granted to service_role', () => {
    expect(unavailableTable({ code: 'PGRST205', message: "Could not find the table 'public.ai_generations'" })).toBe('missing')
    expect(unavailableTable({ code: '42P01' })).toBe('missing')
    expect(unavailableTable({ code: '42501', message: 'permission denied for table ai_generations' })).toBe('forbidden')
    expect(unavailableTable({ code: '23505' })).toBeNull()
  })
})

describe('selectAll', () => {
  it('reads every row even when PostgREST caps pages below 1000 rows', async () => {
    const rows = Array.from({ length: 1234 }, (_, i) => ({ i }))
    const build = fakeTable(rows, { maxRows: 500 })
    expect(await selectAll(() => build())).toHaveLength(1234)
  })
})

describe('selectPage', () => {
  const rows = Array.from({ length: 120 }, (_, i) => ({ i }))

  it('returns the requested page with the total', async () => {
    const result = await selectPage(fakeTable(rows), { page: 2, perPage: 50 })
    expect(result).toMatchObject({ total: 120, page: 2 })
    expect(result.rows[0]).toEqual({ i: 50 })
  })

  it('clamps a page past the end to the last page instead of failing', async () => {
    const result = await selectPage(fakeTable(rows), { page: 9, perPage: 50 })
    expect(result.page).toBe(3)
    expect(result.rows).toHaveLength(20)
  })

  it('answers page 1 with no rows for an empty result', async () => {
    expect(await selectPage(fakeTable([]), { page: 4, perPage: 50 })).toEqual({ rows: [], total: 0, page: 1 })
  })
})

describe('account state', () => {
  it('flags self sign-ups waiting for approval and unused invitations', () => {
    const pending = account('p', { role: 'student', approved: false }, { last_sign_in_at: '2026-09-01T00:00:00Z', email_confirmed_at: 'x' })
    const invited = account('i', { role: 'student', approved: true }, { invited_at: '2026-09-01T00:00:00Z' })
    const active = account('a', { role: 'student' }, { last_sign_in_at: '2026-09-01T00:00:00Z', email_confirmed_at: 'x' })
    expect(accessState(pending)).toEqual({ approved: false, email_confirmed: true, invite_pending: false })
    expect(accessState(invited)).toMatchObject({ approved: true, invite_pending: true })
    expect(accessState(active)).toMatchObject({ approved: true, invite_pending: false })
    expect(matchesRole(pending, 'pending')).toBe(true)
    expect(matchesRole(active, 'pending')).toBe(false)
    // Teachers are always approved
    expect(accessState(account('t', { role: 'teacher', approved: false })).approved).toBe(true)
  })

  it('takes the name from the profile once it exists (a cleared name stays cleared)', () => {
    const user = account('u', {}, { user_metadata: { full_name: 'Old Name' } })
    expect(nameOf(user, { full_name: null })).toBeNull()
    expect(nameOf(user, null)).toBe('Old Name')
    expect(userListItem(user, { full_name: '' }).full_name).toBeNull()
  })
})

describe('sortUserItems', () => {
  const items = [
    { id: '1', full_name: 'Zoé', email: 'z@x.fr', created_at: '2026-01-01', last_sign_in_at: null, lesson_count: 2 },
    { id: '2', full_name: 'Émile', email: 'e@x.fr', created_at: '2026-03-01', last_sign_in_at: '2026-05-01', lesson_count: 5 },
    { id: '3', full_name: 'Anna', email: 'a@x.fr', created_at: '2026-02-01', last_sign_in_at: '2026-04-01', lesson_count: 0 },
  ]

  it('sorts names with French collation and counts numerically', () => {
    expect(sortUserItems(items, 'full_name', 'asc').map((u) => u.id)).toEqual(['3', '2', '1'])
    expect(sortUserItems(items, 'lesson_count', 'desc').map((u) => u.id)).toEqual(['2', '1', '3'])
  })

  it('keeps empty values last in both directions', () => {
    expect(sortUserItems(items, 'last_sign_in_at', 'desc').map((u) => u.id)).toEqual(['2', '3', '1'])
    expect(sortUserItems(items, 'last_sign_in_at', 'asc').map((u) => u.id)).toEqual(['3', '2', '1'])
  })

  it('defaults to newest first', () => {
    expect(sortUserItems(items, 'unknown').map((u) => u.id)).toEqual(['2', '3', '1'])
  })
})

describe('last admin / last teacher', () => {
  const owner = account('owner', { role: 'teacher', is_admin: true })
  const student = account('s1', { role: 'student' })
  const same = (u) => ({ role: u.app_metadata.role, isAdmin: u.app_metadata.is_admin === true, active: true })

  it('refuses removing the only admin or the only teacher', () => {
    const users = [owner, student]
    expect(losesPrivileges(owner, { ...same(owner), isAdmin: false })).toBe(true)
    expect(() => assertPrivilegesRemain(users, owner, { ...same(owner), isAdmin: false })).toThrow(BadRequest)
    expect(() => assertPrivilegesRemain(users, owner, { ...same(owner), role: 'student' })).toThrow(/dernier compte prof/)
    expect(() => assertPrivilegesRemain(users, owner, { ...same(owner), active: false })).toThrow(BadRequest)
  })

  it('allows it when another active account keeps the privilege', () => {
    const second = account('second', { role: 'teacher', is_admin: true })
    expect(() => assertPrivilegesRemain([owner, second], owner, { ...same(owner), role: 'student', isAdmin: false })).not.toThrow()
  })

  it('does not count a banned account as the remaining one', () => {
    const banned = account('banned', { role: 'teacher', is_admin: true }, { banned_until: FUTURE })
    expect(() => assertPrivilegesRemain([owner, banned], owner, { ...same(owner), isAdmin: false })).toThrow(BadRequest)
  })

  it('ignores changes that keep the privileges (and upper-case ids)', () => {
    expect(losesPrivileges(student, { role: 'student', isAdmin: false, active: false })).toBe(false)
    const upper = { ...owner, id: 'OWNER' }
    expect(() => assertPrivilegesRemain([owner], upper, { ...same(owner), isAdmin: false })).toThrow(BadRequest)
  })
})

describe('AI spend', () => {
  it('sums the ledger, failures included', () => {
    const rows = [
      { kind: 'lesson', ok: true, prompt_tokens: 1_000_000, completion_tokens: 100_000, duration_ms: 30_000 },
      { kind: 'lesson', ok: false, prompt_tokens: 500_000, completion_tokens: null, duration_ms: 10_000 },
      { kind: 'plan', ok: true, prompt_tokens: null, completion_tokens: null, duration_ms: null },
    ]
    const summary = aiLedgerSummary(rows, { AI_PRICE_INPUT_PER_M: '0.1', AI_PRICE_OUTPUT_PER_M: '1' })
    expect(summary).toMatchObject({
      source: 'ledger',
      calls: 3,
      failures: 1,
      failure_rate: 33,
      avg_duration_ms: 20_000,
      by_kind: { lesson: 2, plan: 1 },
      prompt_tokens: 1_500_000,
      completion_tokens: 100_000,
      estimated_cost_usd: 0.25,
    })
  })

  it('falls back to lessons.ai_usage without failure data', () => {
    const summary = aiUsageSummary([{ prompt_tokens: 10, completion_tokens: 5 }, null], {})
    expect(summary).toMatchObject({ source: 'lessons', calls: 1, failures: null, failure_rate: null, prompt_tokens: 10 })
  })

  it('uses the cost reported by OpenRouter, and the estimate only for rows without it', () => {
    const env = { AI_PRICE_INPUT_PER_M: '0.1', AI_PRICE_OUTPUT_PER_M: '1' }
    const reported = [
      { kind: 'lesson', ok: true, prompt_tokens: 1_000_000, completion_tokens: 0, cost_usd: 0.3 },
      { kind: 'plan', ok: false, prompt_tokens: 10, completion_tokens: 0, cost_usd: '0.000002' }, // numeric comes back as a string too
    ]
    expect(aiLedgerSummary(reported, env)).toMatchObject({
      cost_usd: 0.300002,
      cost_source: 'provider',
      provider_cost_usd: 0.300002,
      provider_cost_calls: 2,
      estimated_calls: 0,
      estimated_cost_usd: 0.1,
    })

    // Older rows (before OpenRouter reported costs) keep the token × price estimate
    const mixed = [...reported, { kind: 'lesson', ok: true, prompt_tokens: 0, completion_tokens: 1_000_000, cost_usd: null }]
    expect(aiLedgerSummary(mixed, env)).toMatchObject({ cost_usd: 1.300002, cost_source: 'mixed', estimated_calls: 1 })

    // No cost anywhere (other provider, or cost_usd column missing): the estimate, as before
    const legacy = [{ kind: 'lesson', ok: true, prompt_tokens: 1_000_000, completion_tokens: 100_000 }, { kind: 'lesson', ok: false }]
    expect(aiLedgerSummary(legacy, env)).toMatchObject({ cost_usd: 0.2, cost_source: 'estimate', provider_cost_usd: null, estimated_calls: 1 })
    expect(aiUsageSummary([{ prompt_tokens: 5, cost: 0.004 }], env)).toMatchObject({ cost_usd: 0.004, cost_source: 'provider' })
  })

  it('counts per UTC day over the last 30 days', () => {
    const days = lastDays(30, new Date('2026-09-30T12:00:00Z'))
    expect(days).toHaveLength(30)
    expect(days[29]).toBe('2026-09-30')
    const counts = dailyCounts(days, ['2026-09-30T01:00:00Z', '2026-09-30T23:00:00Z', '2025-01-01T00:00:00Z', null])
    expect(counts[29]).toBe(2)
    expect(counts.reduce((a, b) => a + b, 0)).toBe(2)
  })

  it('computes 30-day AI cost and average cost per lesson when since is provided', () => {
    const env = { AI_PRICE_INPUT_PER_M: '0.1', AI_PRICE_OUTPUT_PER_M: '1' }
    const rows = [
      { kind: 'lesson', ok: true, prompt_tokens: 1_000_000, completion_tokens: 0, cost_usd: 0.1, created_at: '2026-09-25T10:00:00Z' },
      { kind: 'lesson', ok: true, prompt_tokens: 1_000_000, completion_tokens: 0, cost_usd: 0.1, created_at: '2026-08-01T10:00:00Z' },
    ]
    const summary = aiLedgerSummary(rows, env, { since: '2026-09-01T00:00:00.000Z' })
    expect(summary.cost_30d_usd).toBe(0.1)
    expect(summary.calls_30d).toBe(1)
    expect(summary.avg_cost_per_lesson_usd).toBe(0.1)
  })

  it('computes recurring revenue (MRR), margin and subscriber rates with financeSummary', () => {
    const subs = [
      { user_id: 'u1', status: 'active', amount_cents: 2900, plan: 'monthly', provider: 'stripe' },
      { user_id: 'u2', status: 'trialing', amount_cents: 12000, plan: 'yearly', provider: 'mollie' }, // 10 EUR/mo
      { user_id: 'u3', status: 'canceled', amount_cents: 2900, plan: 'monthly', provider: 'stripe' },
    ]
    const finance = financeSummary(subs, 5.0, 10) // 5 USD AI cost, 10 students
    expect(finance.active_subscribers).toBe(2)
    expect(finance.subscribers_rate).toBe(20) // 2 / 10 = 20%
    expect(finance.mrr_eur).toBe(39) // 29 + 10
    expect(finance.ai_cost_eur).toBe(4.6) // 5.0 * 0.92 = 4.60 EUR
    expect(finance.gross_margin_eur).toBe(34.4) // 39 - 4.60 = 34.40 EUR
    expect(finance.arpu_eur).toBe(19.5) // 39 / 2
    expect(finance.providers).toEqual({ stripe: 1, mollie: 1 })
  })

  it('formats EUR currency correctly with formatEur', () => {
    expect(formatEur(29)).toContain('29,00')
    expect(formatEur(29)).toContain('€')
    expect(formatEur(0)).toContain('0,00')
    expect(formatEur(null)).toBe('—')
  })
})

describe('strict lesson edits', () => {
  it('lists the exercises the normalizer would drop (e.g. choices equal once spaces collapse)', () => {
    const list = [mcq('ex_1'), mcq('ex_2', ['il  va', 'il va', 'x']), { type: 'fill_blank', sentence: 'no blank', answers: ['a'] }]
    expect(invalidExercisePositions(list)).toEqual([2, 3])
    expect(invalidExercisePositions([mcq('ex_1')])).toEqual([])
  })

  it('reports content rows that would be dropped or altered', () => {
    expect(contentProblems({ vocabulary: [{ fr: 'chat', en: 'cat' }] })).toEqual([])
    const problems = contentProblems({
      vocabulary: [{ fr: 'chat', en: 'cat' }, { fr: 'chien', en: '' }],
      homework: [{ task: 'Regarder', link: 'https://example.com/video' }],
    })
    expect(problems).toHaveLength(2)
    expect(problems[0]).toMatch(/Vocabulaire : élément n° 2/)
    expect(problems[1]).toMatch(/Devoirs n° 1 : lien refusé/)
    expect(contentProblems({ grammar: Array.from({ length: 7 }, () => ({ title: 't', explanation: 'e' })) })[0]).toMatch(
      /6 éléments au maximum/
    )
  })

  it('resets progress only when an exercise is added or changed', () => {
    const stored = normalizeExercisesForEdit([mcq('ex_1'), mcq('ex_2', ['a', 'b', 'c'], 0)])
    const reordered = normalizeExercisesForEdit([stored[1], stored[0]], { reservedIds: ['ex_1', 'ex_2'] })
    const removed = normalizeExercisesForEdit([stored[0]], { reservedIds: ['ex_1', 'ex_2'] })
    const edited = normalizeExercisesForEdit([{ ...stored[0], answer: 2 }, stored[1]])
    const added = normalizeExercisesForEdit([...stored, mcq(undefined)], { reservedIds: ['ex_1', 'ex_2'] })
    expect(exercisesResetProgress(stored, reordered)).toBe(false)
    expect(exercisesResetProgress(stored, removed)).toBe(false)
    expect(exercisesResetProgress(stored, edited)).toBe(true)
    expect(exercisesResetProgress(stored, added)).toBe(true)
    // Key order does not matter
    const shuffledKeys = stored.map((e) => Object.fromEntries(Object.entries(e).reverse()))
    expect(exercisesResetProgress(shuffledKeys, stored)).toBe(false)
  })
})

describe('table explorer registry', () => {
  it('lists the 0006 tables and subscriptions as optional and the new lesson columns', () => {
    expect(TABLES.lesson_plans.optional).toBe(true)
    expect(TABLES.ai_generations.optional).toBe(true)
    expect(TABLES.subscriptions.optional).toBe(true)
    expect(TABLES.subscriptions.columns.map((c) => c.name)).toContain('amount_cents')
    const lessonColumns = TABLES.lessons.columns.map((c) => c.name)
    expect(lessonColumns).toEqual(expect.arrayContaining(['hidden', 'client_key', 'source_text', 'generation_options']))
    expect(TABLES.student_notes.columns.map((c) => c.name)).toContain('ai_context')
  })

  it('checks sort columns and builds a safe search filter', () => {
    expect(parseSort(TABLES.lessons, {})).toEqual({ column: 'created_at', ascending: false })
    expect(parseSort(TABLES.lessons, { sort: 'title' })).toEqual({ column: 'title', ascending: true })
    expect(() => parseSort(TABLES.lessons, { sort: 'password' })).toThrow(BadRequest)
    expect(searchFilter(TABLES.admin_audit_log, 'a*')).toContain('admin_email.ilike."%a_%"')
    const id = '0F8FAD5B-D9CB-469F-A165-70867728950E'
    expect(searchFilter(TABLES.practice_sessions, id)).toContain(`lesson_id.eq.${id.toLowerCase()}`)
  })

  it('shows cost_usd empty instead of failing while 0006 has not been re-run', async () => {
    expect(TABLES.ai_generations.columns.find((c) => c.name === 'cost_usd')).toMatchObject({ type: 'number', mayBeMissing: true })
    const selects = []
    const admin = {
      from: () => {
        const q = { orders: [] }
        const builder = {
          select: (columns) => ((q.columns = columns), builder),
          or: () => builder,
          order: (column) => (q.orders.push(column), builder),
          range: async () => {
            selects.push(q)
            if (q.columns.includes('cost_usd')) return { data: null, error: { code: '42703', message: 'column ai_generations.cost_usd does not exist' } }
            return { data: [{ id: 'g1', kind: 'lesson', ok: true, prompt_tokens: 3 }], count: 1, error: null }
          },
        }
        return builder
      },
    }
    const page = await readTablePage(admin, 'ai_generations', { sort: 'cost_usd' })
    expect(page.rows).toEqual([expect.objectContaining({ id: 'g1', prompt_tokens: 3, cost_usd: null })])
    expect(page.columns.map((c) => c.name)).toContain('cost_usd')
    // The retry drops the column and its sort
    expect(selects.at(-1).orders[0]).toBe('created_at')
  })

  it('always truncates long sources', () => {
    const row = formatRow(TABLES.lessons, { source_text: 'x'.repeat(900), hidden: true })
    expect(row.source_text).toHaveLength(501)
    expect(row.hidden).toBe(true)
  })
})

describe('lesson editor model', () => {
  const lesson = {
    title: 'Leçon',
    lesson_date: '2026-09-30',
    status: 'published',
    student_id: 'abc',
    hidden: false,
    drive_url: '',
    content: { title: 'Recap', vocabulary: [{ fr: 'chat', en: 'cat' }] },
    exercises: [mcq('ex_1')],
  }

  it('validates like the server (collapsed spaces, YouTube-only homework links)', () => {
    const draft = toDraft({
      ...lesson,
      exercises: [mcq('ex_1', ['il  va', 'il va', 'x'])],
      content: { homework: [{ task: 'Regarder', link: 'https://example.com' }] },
    })
    const errors = validateDraft(draft)
    expect(errors['exercises.0.choices']).toMatch(/différents/)
    expect(errors['content.homework.0.link']).toMatch(/YouTube/)
  })

  it('keeps edits typed while a save was in flight', () => {
    const sent = { ...toDraft(lesson), hidden: true, driveUrl: ' https://drive.google.com/x ' }
    const current = { ...sent, title: 'Typed during the save' }
    const saved = toDraft({ ...lesson, hidden: true, drive_url: 'https://drive.google.com/x' })
    const merged = mergeAfterSave(current, sent, saved)
    expect(merged.title).toBe('Typed during the save')
    expect(merged.hidden).toBe(true)
    // Not edited during the save: the server value (normalized) wins
    expect(merged.driveUrl).toBe('https://drive.google.com/x')
    // Unchanged fields keep the local objects (stable row keys)
    expect(merged.content).toBe(current.content)
  })

  it('warns about a progress reset only for added or edited exercises', () => {
    const original = toDraft(lesson)
    expect(draftResetsProgress(original.exercises.slice(0, 0), original.exercises)).toBe(false)
    expect(draftResetsProgress([{ ...original.exercises[0], answer: 2 }], original.exercises)).toBe(true)
    expect(draftResetsProgress([...original.exercises, { type: 'mcq' }], original.exercises)).toBe(true)
  })
})
