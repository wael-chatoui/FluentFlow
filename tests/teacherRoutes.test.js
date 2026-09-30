// Teacher lesson / student routes against a small in-memory Supabase stand-in:
// polling payload, delete during a generation, exercise edits and the student's lesson list.
import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ db: {}, users: new Map(), onRun: null }))

vi.mock('@/utils/supabase/admin', () => ({ createAdminClient: () => fakeAdmin() }))
vi.mock('@/utils/auth/server', async (importOriginal) => ({
  ...(await importOriginal()),
  requireTeacher: async () => ({ user: { id: 'teacher' }, role: 'teacher' }),
}))

const { default: lessonRoute } = await import('@/pages/api/teacher/lessons/[id]/index')
const { default: studentRoute } = await import('@/pages/api/teacher/students/[id]/index')

let clock = Date.parse('2026-09-30T10:00:00Z')
const stamp = () => new Date((clock += 1000)).toISOString()

class Query {
  constructor(table) {
    this.table = table
    this.mode = 'select'
    this.filters = []
  }
  select(columns = '*', options = {}) {
    if (this.mode === 'select') {
      this.columns = columns
      this.head = Boolean(options.head)
    }
    return this
  }
  update(patch) {
    this.mode = 'update'
    this.patch = patch
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
  lt(column, value) {
    this.filters.push((r) => r[column] < value)
    return this
  }
  gte(column, value) {
    this.filters.push((r) => r[column] >= value)
    return this
  }
  order() {
    return this
  }
  range(from, to) {
    this.slice = [from, to + 1]
    return this
  }
  maybeSingle() {
    this.single = true
    return this
  }
  run() {
    state.onRun?.(this)
    const rows = state.db[this.table] || []
    const matched = rows.filter((r) => this.filters.every((f) => f(r)))
    if (this.mode === 'update') for (const r of matched) Object.assign(r, this.patch, { updated_at: stamp() })
    if (this.mode === 'delete') state.db[this.table] = rows.filter((r) => !matched.includes(r))
    if (this.head) return { data: null, count: matched.length, error: null }
    const fields = this.columns && this.columns !== '*' ? this.columns.split(',').map((c) => c.trim()) : null
    const data = matched.map((r) => (fields ? Object.fromEntries(fields.map((f) => [f, r[f]])) : { ...r }))
    const page = this.slice ? data.slice(...this.slice) : data
    return { data: this.single ? (page[0] ?? null) : page, error: null }
  }
  then(resolve, reject) {
    return Promise.resolve(this.run()).then(resolve, reject)
  }
}

function fakeAdmin() {
  return {
    from: (table) => new Query(table),
    auth: { admin: { getUserById: async (id) => ({ data: { user: state.users.get(id) || null }, error: null }) } },
  }
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

const LESSON_ID = '0f8fad5b-d9cb-469f-a165-70867728950e'
const STUDENT_ID = '7c9e6679-7425-40de-944b-e07fc1f90ae7'
const minutesAgo = (n) => new Date(Date.now() - n * 60_000).toISOString()

const mcq = (id, sentence = 'Je ___ au marché.') => ({
  id,
  type: 'mcq',
  prompt: 'Choisis',
  sentence,
  choices: ['va', 'vais', 'vont'],
  answer: 1,
  explanation: '',
})

function lessonRow(extra = {}) {
  return {
    id: LESSON_ID,
    student_id: STUDENT_ID,
    title: 'Le marché',
    lesson_date: '2026-09-29',
    status: 'published',
    error: null,
    hidden: false,
    content: { summary: 'x' },
    exercises: [mcq('ex_1'), mcq('ex_2', 'Tu ___ au parc.'), mcq('ex_3', 'Il ___ à Lyon.')],
    transcript: 't'.repeat(1000),
    canva: '',
    source_kind: 'import',
    source_name: 'recap.pdf',
    source_text: 'd'.repeat(5000),
    generation_options: null,
    drive_url: null,
    ai_model: 'm',
    generated_at: '2026-09-29T10:00:00.000Z',
    created_at: '2026-09-29T09:00:00.000Z',
    updated_at: minutesAgo(1),
    ...extra,
  }
}

beforeEach(() => {
  state.onRun = null
  state.users = new Map([[STUDENT_ID, { id: STUDENT_ID, email: 'eleve@x.fr', app_metadata: { role: 'student' } }]])
  state.db = {
    lessons: [lessonRow()],
    profiles: [{ id: STUDENT_ID, email: 'eleve@x.fr', full_name: 'Élève', level: 'A2' }],
    student_notes: [],
    practice_sessions: [],
  }
})

describe('GET /api/teacher/lessons/[id]?light=1', () => {
  it('returns only the status fields', async () => {
    state.db.lessons[0].status = 'generating'
    const res = await call(lessonRoute, { query: { id: LESSON_ID, light: '1' } })
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({
      lesson: {
        id: LESSON_ID,
        status: 'generating',
        error: null,
        stale: false,
        hidden: false,
        title: 'Le marché',
        updated_at: state.db.lessons[0].updated_at,
      },
    })
  })

  it('flags a stuck generation as stale and 404s a deleted lesson', async () => {
    Object.assign(state.db.lessons[0], { status: 'generating', updated_at: minutesAgo(6) })
    expect((await call(lessonRoute, { query: { id: LESSON_ID, light: '1' } })).body.lesson.stale).toBe(true)
    state.db.lessons = []
    expect((await call(lessonRoute, { query: { id: LESSON_ID, light: '1' } })).statusCode).toBe(404)
  })

  it('still returns the full lesson without the flag', async () => {
    const res = await call(lessonRoute, { query: { id: LESSON_ID } })
    expect(res.body.lesson).toMatchObject({ source_kind: 'import', student_level: 'A2' })
    expect(res.body.lesson.source_text).toHaveLength(5000)
    expect(res.body.sessions).toEqual([])
  })
})

describe('DELETE /api/teacher/lessons/[id]', () => {
  it('is refused while a generation runs', async () => {
    Object.assign(state.db.lessons[0], { status: 'generating', updated_at: minutesAgo(1) })
    const res = await call(lessonRoute, { method: 'DELETE', query: { id: LESSON_ID } })
    expect(res.statusCode).toBe(409)
    expect(res.body.code).toBe('generating')
    expect(res.body.error).toMatch(/génération est en cours/)
    expect(state.db.lessons).toHaveLength(1)
  })

  it('deletes a stale generation and a published lesson', async () => {
    Object.assign(state.db.lessons[0], { status: 'generating', updated_at: minutesAgo(6) })
    expect((await call(lessonRoute, { method: 'DELETE', query: { id: LESSON_ID } })).body).toEqual({ success: true })
    expect(state.db.lessons).toHaveLength(0)
    expect((await call(lessonRoute, { method: 'DELETE', query: { id: LESSON_ID } })).statusCode).toBe(404)
  })

  it('does not delete a lesson whose regeneration started after the check', async () => {
    state.onRun = (q) => {
      if (q.table === 'lessons' && q.mode === 'delete' && state.db.lessons[0].status === 'published') {
        Object.assign(state.db.lessons[0], { status: 'generating', updated_at: new Date().toISOString() })
      }
    }
    const res = await call(lessonRoute, { method: 'DELETE', query: { id: LESSON_ID } })
    expect(res.statusCode).toBe(409)
    expect(res.body.code).toBe('generating')
    expect(state.db.lessons).toHaveLength(1)
  })
})

describe('PATCH /api/teacher/lessons/[id]', () => {
  const generatedAt = () => state.db.lessons[0].generated_at

  it('keeps progress for a removal sent as the full list, and never reuses a removed id', async () => {
    const before = generatedAt()
    let res = await call(lessonRoute, { method: 'PATCH', query: { id: LESSON_ID }, body: { exercises: [mcq('ex_1'), mcq('ex_2', 'Tu ___ au parc.')] } })
    expect(res.statusCode).toBe(200)
    expect(res.body.lesson.exercises.map((e) => e.id)).toEqual(['ex_1', 'ex_2'])
    expect(generatedAt()).toBe(before)

    const { id: _none, ...added } = mcq(undefined, 'Nous ___ au cinéma.')
    res = await call(lessonRoute, { method: 'PATCH', query: { id: LESSON_ID }, body: { exercises: [...res.body.lesson.exercises, added] } })
    // An id freed by an earlier save may come back: adding an exercise bumps generated_at,
    // so the old results on that id no longer count
    expect(res.body.lesson.exercises.map((e) => e.id)).toEqual(['ex_1', 'ex_2', 'ex_3'])
    expect(generatedAt()).not.toBe(before)
  })

  it('reserves the stored ids when one exercise is swapped for a new one in the same save', async () => {
    const { id: _none, ...added } = mcq(undefined, 'Nous ___ au cinéma.')
    const res = await call(lessonRoute, {
      method: 'PATCH',
      query: { id: LESSON_ID },
      body: { exercises: [mcq('ex_1'), mcq('ex_2', 'Tu ___ au parc.'), added] },
    })
    expect(res.body.lesson.exercises.map((e) => e.id)).toEqual(['ex_1', 'ex_2', 'ex_4'])
  })

  it('refuses exercise edits during a generation', async () => {
    Object.assign(state.db.lessons[0], { status: 'generating', updated_at: minutesAgo(1) })
    const res = await call(lessonRoute, { method: 'PATCH', query: { id: LESSON_ID }, body: { removeExerciseIds: ['ex_1'] } })
    expect(res.statusCode).toBe(409)
    expect(res.body.code).toBe('generating')
  })

  it('dismissError clears the error of a failed regeneration only', async () => {
    state.db.lessons[0].error = 'Crédit épuisé'
    const res = await call(lessonRoute, { method: 'PATCH', query: { id: LESSON_ID }, body: { dismissError: true } })
    expect(res.body.lesson).toMatchObject({ status: 'published', error: null, title: 'Le marché' })

    Object.assign(state.db.lessons[0], { status: 'failed', content: null, error: 'Échec' })
    await call(lessonRoute, { method: 'PATCH', query: { id: LESSON_ID }, body: { dismissError: true } })
    expect(state.db.lessons[0].error).toBe('Échec')
  })
})

describe('GET /api/teacher/students/[id]', () => {
  it('lists each lesson with source_kind, stale and hidden', async () => {
    state.db.lessons.push(
      lessonRow({ id: 'l2', source_kind: 'transcript', status: 'generating', updated_at: minutesAgo(9), hidden: true }),
      lessonRow({ id: 'l3', source_kind: null })
    )
    const res = await call(studentRoute, { query: { id: STUDENT_ID } })
    expect(res.statusCode).toBe(200)
    const byId = Object.fromEntries(res.body.lessons.map((l) => [l.id, l]))
    expect(byId[LESSON_ID]).toMatchObject({ source_kind: 'import', stale: false, hidden: false, exercise_count: 3 })
    expect(byId.l2).toMatchObject({ source_kind: 'transcript', stale: true, hidden: true })
    expect(byId.l3.source_kind).toBe('transcript')
  })
})
