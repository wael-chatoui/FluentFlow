// Student saves when the teacher changes a lesson under the student (review and practice
// POST), and the bounded loading of practice answers behind mistakes, against a small
// in-memory Supabase stand-in.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { answersNeeded, computeMistakes, withMistakeAnswers } from '@/utils/api/mistakes'
import { replacedLessons } from '@/utils/api/studentLessons'
import { reviewResult, reviewSavedText } from '@/components/student/review/result'

const state = vi.hoisted(() => ({ db: {}, onRun: null, studentId: '7c9e6679-7425-40de-944b-e07fc1f90ae7' }))

vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: () => fakeAdmin() }))
vi.mock('@/utils/auth/server', async (importOriginal) => ({
  ...(await importOriginal()),
  requireUser: async () => ({ user: { id: state.studentId }, role: 'student' }),
}))

const { default: reviewRoute } = await import('@/pages/api/student/review')
const { default: practiceRoute } = await import('@/pages/api/student/lessons/[id]/practice')
const { default: lessonsRoute } = await import('@/pages/api/student/lessons/index')

const STUDENT_ID = state.studentId
const LESSON_A = '0f8fad5b-d9cb-469f-a165-70867728950e'
const LESSON_B = '1b4e28ba-2fa1-41d2-883f-0016d3cca427'
const RUN_ID = '9b2f4a52-3c1d-4e5f-8a6b-7c8d9e0f1a2b'
const V1 = '2026-09-29T10:00:00.000Z'

let clock
let seq
const stamp = () => new Date((clock += 1000)).toISOString()

// ---- in-memory stand-in for the supabase-js query builder ----
function project(row, columns) {
  if (!columns || columns === '*') return { ...row }
  const out = {}
  for (const col of columns.split(',').map((c) => c.trim())) {
    const [alias, path] = col.includes(':') ? col.split(':') : [col, col]
    const [field, key] = path.split('->')
    out[alias] = key ? (row[field]?.[key] ?? null) : row[field]
  }
  return out
}

class Query {
  constructor(table) {
    this.table = table
    this.mode = 'select'
    this.filters = []
    this.orders = []
  }
  select(columns = '*') {
    if (this.mode === 'select') this.columns = columns
    else this.returning = columns
    return this
  }
  insert(rows) {
    this.mode = 'insert'
    this.rows = Array.isArray(rows) ? rows : [rows]
    return this
  }
  delete() {
    this.mode = 'delete'
    return this
  }
  eq(column, value) {
    this.filters.push((r) => r[column] === value)
    return this
  }
  in(column, values) {
    this.filters.push((r) => values.includes(r[column]))
    return this
  }
  not(column) {
    this.filters.push((r) => r[column] !== null && r[column] !== undefined) // only `not(col, 'is', null)` is used
    return this
  }
  order(column, { ascending = true } = {}) {
    this.orders.push([column, ascending])
    return this
  }
  range(from, to) {
    this.window = [from, to]
    return this
  }
  maybeSingle() {
    this.single = true
    return this
  }
  run() {
    state.onRun?.(this)
    const rows = (state.db[this.table] ||= [])
    if (this.mode === 'insert') {
      const unique = this.table === 'practice_sessions'
      if (unique && this.rows.some((n) => rows.some((r) => r.student_id === n.student_id && r.client_run_id === n.client_run_id))) {
        return { data: null, error: { code: '23505', message: 'duplicate key' } }
      }
      const at = stamp()
      const added = this.rows.map((n) => ({ id: `row-${(seq += 1)}`, completed_at: at, created_at: at, ...n }))
      rows.push(...added)
      return { data: this.returning ? added.map((r) => project(r, this.returning)) : null, error: null }
    }
    const matched = rows.filter((r) => this.filters.every((f) => f(r)))
    if (this.mode === 'delete') {
      state.db[this.table] = rows.filter((r) => !matched.includes(r))
      return { data: null, error: null }
    }
    const sorted = [...matched].sort((a, b) => {
      for (const [column, ascending] of this.orders) {
        if (a[column] === b[column]) continue
        return (a[column] < b[column] ? -1 : 1) * (ascending ? 1 : -1)
      }
      return 0
    })
    const page = this.window ? sorted.slice(this.window[0], this.window[1] + 1) : sorted
    const data = page.map((r) => project(r, this.columns))
    return { data: this.single ? (data[0] ?? null) : data, error: null }
  }
  then(resolve, reject) {
    return Promise.resolve()
      .then(() => this.run())
      .then(resolve, reject)
  }
}

function fakeAdmin() {
  return { from: (table) => new Query(table) }
}

function call(handler, { method = 'GET', query = {}, body } = {}) {
  const res = {
    statusCode: 200,
    body: undefined,
    setHeader() {},
    status(code) {
      this.statusCode = code
      return this
    },
    json(payload) {
      this.body = payload
      return this
    },
  }
  return Promise.resolve(handler({ method, query, body, headers: {} }, res)).then(() => res)
}

const mcq = (id) => ({ id, type: 'mcq', prompt: 'Choisis', sentence: 'Je ___ au marché.', choices: ['va', 'vais', 'vont'], answer: 1 })

function lessonRow(id, extra = {}) {
  return {
    id,
    student_id: STUDENT_ID,
    title: `Leçon ${id.slice(0, 4)}`,
    lesson_date: '2026-09-29',
    status: 'published',
    hidden: false,
    content: { summary: 'x', vocabulary: [], expressions: [] },
    exercises: [mcq('ex_1'), mcq('ex_2')],
    generated_at: V1,
    created_at: V1,
    ...extra,
  }
}

const lessonOf = (id) => state.db.lessons.find((l) => l.id === id)
// The teacher replaces the exercises: generated_at moves on (app clock, like the teacher route)
const regenerate = (id) => Object.assign(lessonOf(id), { generated_at: stamp() })

beforeEach(() => {
  clock = Date.parse('2026-09-30T10:00:00Z')
  seq = 0
  state.onRun = null
  state.db = {
    lessons: [lessonRow(LESSON_A), lessonRow(LESSON_B)],
    profiles: [{ id: STUDENT_ID, drive_folder_url: null }],
    practice_sessions: [],
    review_attempts: [],
  }
})

// ---------------------------------------------------------------------------
// POST /api/student/review
// ---------------------------------------------------------------------------
describe('POST /api/student/review', () => {
  const answer = (lessonId, exerciseId, value = 1, version = V1) => ({ exerciseId: `${lessonId}:${exerciseId}`, value, version })
  const submit = (answers) => call(reviewRoute, { method: 'POST', body: { answers } })

  it('grades current answers and logs one attempt each', async () => {
    const res = await submit([answer(LESSON_A, 'ex_1', 1), answer(LESSON_A, 'ex_2', 0)])
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ score: 1, total: 2, skipped: 0 })
    expect(state.db.review_attempts).toHaveLength(2)
  })

  it('saves a round whose only lesson was hidden or deleted meanwhile, as skipped (not a 400)', async () => {
    lessonOf(LESSON_A).hidden = true
    state.db.lessons = state.db.lessons.filter((l) => l.id !== LESSON_B)
    const res = await submit([answer(LESSON_A, 'ex_1'), answer(LESSON_B, 'ex_1')])
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ score: 0, total: 0, skipped: 2 })
    expect(state.db.review_attempts).toHaveLength(0)
  })

  it('counts answers to removed exercises and to replaced versions in skipped', async () => {
    lessonOf(LESSON_A).exercises = [mcq('ex_1')] // ex_2 removed (a pure removal keeps the version)
    regenerate(LESSON_B)
    const res = await submit([
      answer(LESSON_A, 'ex_1', 1),
      answer(LESSON_A, 'ex_2', 1),
      answer(LESSON_A, 'ex_2', 0), // second answer to the same exercise: ignored, not skipped twice
      answer(LESSON_B, 'ex_1', 1),
    ])
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ score: 1, total: 1, skipped: 2 })
    expect(state.db.review_attempts.map((r) => r.exercise_id)).toEqual(['ex_1'])
  })

  it('keeps the 400 for answers that were malformed from the start', async () => {
    const res = await submit([{ exerciseId: 'not-a-composite-id', value: 1 }])
    expect(res.statusCode).toBe(400)
    expect(state.db.review_attempts).toHaveLength(0)
  })

  it('undoes the attempts of a lesson replaced between the version check and the insert', async () => {
    state.onRun = (q) => {
      if (q.table === 'review_attempts' && q.mode === 'insert') regenerate(LESSON_A)
    }
    const res = await submit([answer(LESSON_A, 'ex_1', 1), answer(LESSON_B, 'ex_1', 0)])
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ score: 0, total: 1, skipped: 1 })
    expect(state.db.review_attempts.map((r) => r.lesson_id)).toEqual([LESSON_B])
  })
})

// ---------------------------------------------------------------------------
// POST /api/student/lessons/[id]/practice
// ---------------------------------------------------------------------------
describe('POST /api/student/lessons/[id]/practice', () => {
  const answers = [
    { exerciseId: 'ex_1', value: 1 },
    { exerciseId: 'ex_2', value: 0 },
  ]
  const save = (body = {}) =>
    call(practiceRoute, { method: 'POST', query: { id: LESSON_A }, body: { answers, version: V1, runId: RUN_ID, ...body } })

  it('stores a run of the current version', async () => {
    const res = await save()
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ score: 1, total: 2, bestScore: 1, bestTotal: 2 })
    expect(state.db.practice_sessions).toHaveLength(1)
  })

  it('answers 409 lesson_unavailable for a lesson hidden or deleted during the run', async () => {
    lessonOf(LESSON_A).hidden = true
    const hidden = await save()
    expect(hidden.statusCode).toBe(409)
    expect(hidden.body.code).toBe('lesson_unavailable')

    state.db.lessons = []
    const deleted = await save()
    expect(deleted.statusCode).toBe(409)
    expect(deleted.body.code).toBe('lesson_unavailable')
    expect(state.db.practice_sessions).toHaveLength(0)
  })

  it('answers lesson_updated when every answered exercise was removed during the run', async () => {
    lessonOf(LESSON_A).exercises = [mcq('ex_3')]
    const res = await save()
    expect(res.statusCode).toBe(409)
    expect(res.body.code).toBe('lesson_updated')
  })

  it('keeps the 400 for an empty or malformed answer list', async () => {
    const res = await save({ answers: [{ value: 1 }] })
    expect(res.statusCode).toBe(400)
  })

  it('undoes a run when the lesson was replaced between the version check and the insert', async () => {
    state.onRun = (q) => {
      if (q.table === 'practice_sessions' && q.mode === 'insert') regenerate(LESSON_A)
    }
    const res = await save()
    expect(res.statusCode).toBe(409)
    expect(res.body.code).toBe('lesson_updated')
    expect(state.db.practice_sessions).toHaveLength(0)
  })

  it('on a retry, undoes a run that slipped in after the update, but returns one saved before it', async () => {
    const stored = { lesson_id: LESSON_A, student_id: STUDENT_ID, score: 2, total: 2, answers: [], client_run_id: RUN_ID }

    // Saved before the update (lost response): its stored result, as a duplicate
    state.db.practice_sessions = [{ id: 'old', completed_at: stamp(), ...stored }]
    regenerate(LESSON_A)
    const before = await save()
    expect(before.statusCode).toBe(200)
    expect(before.body).toMatchObject({ score: 2, total: 2, duplicate: true })
    expect(state.db.practice_sessions).toHaveLength(1)

    // Stored after the update although graded against the old exercises: removed
    state.db.practice_sessions = [{ id: 'late', completed_at: stamp(), ...stored }]
    const after = await save()
    expect(after.statusCode).toBe(409)
    expect(after.body.code).toBe('lesson_updated')
    expect(state.db.practice_sessions).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// Answers behind mistakes: only the sessions that can decide one are loaded
// ---------------------------------------------------------------------------
describe('answersNeeded', () => {
  const lesson = { id: 'L', exercises: [{ id: 'ex_1' }, { id: 'ex_2' }], generated_at: '2026-09-10T00:00:00Z' }
  const session = (id, day) => ({ id, lesson_id: 'L', completed_at: `2026-09-${day}T00:00:00Z` })
  const sessions = [session('old', '05'), session('s1', '11'), session('s2', '12'), session('s3', '13')]

  it('asks for the newest current session, then nothing once every exercise has a result', () => {
    expect(answersNeeded([lesson], sessions, new Map())).toEqual(['s3'])
    const loaded = new Map([['s3', [{ exerciseId: 'ex_1' }, { exerciseId: 'ex_2' }]]])
    expect(answersNeeded([lesson], sessions, loaded)).toEqual([])
  })

  it('goes further back only while an exercise has no result, never before generated_at', () => {
    const loaded = new Map([['s3', [{ exerciseId: 'ex_1' }]]])
    expect(answersNeeded([lesson], sessions, loaded)).toEqual(['s2'])
    expect(answersNeeded([lesson], sessions, loaded, { all: true })).toEqual(['s2', 's1'])
  })

  it('takes sessions recorded at the same instant together', () => {
    const tied = [...sessions, { ...session('s4', '13') }]
    expect(answersNeeded([lesson], tied, new Map()).sort()).toEqual(['s3', 's4'])
  })
})

describe('withMistakeAnswers', () => {
  it('gives the same mistakes as the whole history while loading only the answers that matter', async () => {
    const at = (day) => `2026-09-${day}T12:00:00.000Z` // after V1: current results
    const run = (id, lessonId, day, results) => ({
      id,
      lesson_id: lessonId,
      student_id: STUDENT_ID,
      score: 0,
      total: 2,
      completed_at: at(day),
      answers: Object.entries(results).map(([exerciseId, correct]) => ({ exerciseId, correct, value: 0 })),
    })
    state.db.practice_sessions = [
      run('a1', LESSON_A, 29, { ex_1: false, ex_2: false }),
      run('a2', LESSON_A, 30, { ex_1: true }), // partial run: ex_2's latest result is in a1
      run('b1', LESSON_B, 29, { ex_1: true, ex_2: true }),
      run('b2', LESSON_B, 30, { ex_1: false, ex_2: true }),
    ]
    const lessons = state.db.lessons
    const light = state.db.practice_sessions.map(({ answers, ...s }) => s) // eslint-disable-line no-unused-vars
    const everything = computeMistakes(lessons, state.db.practice_sessions, [])

    const fetched = []
    state.onRun = (q) => {
      if (q.table !== 'practice_sessions' || q.columns !== 'id, answers') return
      fetched.push(state.db.practice_sessions.filter((r) => q.filters.every((f) => f(r))).map((r) => r.id))
    }
    const sessions = await withMistakeAnswers(fakeAdmin(), STUDENT_ID, lessons, light)
    expect(computeMistakes(lessons, sessions, [])).toEqual(everything)
    expect(everything.map((m) => `${m.lesson.id.slice(0, 4)}:${m.exercise.id}`).sort()).toEqual(['0f8f:ex_2', '1b4e:ex_1'])
    // Round 1: the newest run of each lesson; round 2: the rest of lesson A only (ex_2 had no result in a2)
    expect(fetched.map((ids) => ids.sort())).toEqual([['a2', 'b2'], ['a1']])
  })

  it('backs GET /api/student/lessons (mistake count from the bounded answers)', async () => {
    const answers = [
      { exerciseId: 'ex_1', correct: true },
      { exerciseId: 'ex_2', correct: false },
    ]
    const common = { lesson_id: LESSON_A, student_id: STUDENT_ID, client_run_id: null }
    state.db.practice_sessions = [{ id: 's1', ...common, score: 1, total: 2, completed_at: stamp(), answers }]
    const res = await call(lessonsRoute)
    expect(res.statusCode).toBe(200)
    expect(res.body.mistakeCount).toBe(1)
    expect(res.body.lessons.find((l) => l.id === LESSON_A)).toMatchObject({ best_score: 1, best_total: 2, attempts: 1 })
  })
})

describe('replacedLessons', () => {
  it('flags lessons whose version changed or which are gone', () => {
    const before = [
      { id: 'a', generated_at: '2026-09-29T10:00:00.123456+00:00' },
      { id: 'b', generated_at: V1 },
      { id: 'c', generated_at: V1 },
    ]
    const after = [
      { id: 'a', generated_at: '2026-09-29T10:00:00.123456Z' }, // same instant, other format
      { id: 'b', generated_at: '2026-09-30T08:00:00.000Z' },
    ]
    expect([...replacedLessons(before, after)].sort()).toEqual(['b', 'c'])
  })
})

describe('review round result', () => {
  it('keeps the server score, with the skipped answers in the saved text', () => {
    const result = reviewResult({ score: 2, total: 3, remaining: 4, skipped: 1 })
    expect(result).toEqual({ score: 2, total: 3, remaining: 4, skipped: 1 })
    expect(reviewSavedText(result)).toBe('Saved · 4 mistakes left to fix · 1 answer skipped (lesson updated or removed)')
  })

  it('drops the 0/0 score when every answer was skipped (the player shows the round played)', () => {
    const result = reviewResult({ score: 0, total: 0, remaining: 0, skipped: 5 })
    expect(result).toEqual({ remaining: 0, skipped: 5 })
    expect(reviewSavedText(result)).toBe('Saved · No mistakes left! · 5 answers skipped (lesson updated or removed)')
  })
})
