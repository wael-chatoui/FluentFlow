import { describe, expect, it } from 'vitest'
import {
  createRun,
  currentExercise,
  doneCount,
  fingerprint,
  firstAnswers,
  isScoreFinal,
  newRunId,
  restoreRun,
  runReducer,
  toSnapshot,
} from '@/components/practice/runState'
import { isLikelyFrench, plainText, speakable, splitBlank } from '@/components/practice/utils'

const EXERCISES = [
  { id: 'ex_1', type: 'mcq', prompt: 'p', sentence: 'Je ___ allé.', choices: ['suis', 'ai', 'es'], answer: 0, explanation: '' },
  { id: 'ex_2', type: 'fill_blank', prompt: 'p', sentence: 'Elle ___ partie.', answers: ['est'], hint: '', explanation: '' },
  {
    id: 'ex_3',
    type: 'match',
    prompt: 'p',
    pairs: [
      { fr: 'un', en: 'one' },
      { fr: 'deux', en: 'two' },
      { fr: 'trois', en: 'three' },
    ],
    explanation: '',
  },
]

const play = (state, ...values) =>
  values.reduce((s, value) => runReducer(runReducer(s, { type: 'check', value }), { type: 'continue' }), state)

describe('runReducer', () => {
  it('re-queues a wrong answer and only keeps the first attempt', () => {
    let s = createRun(EXERCISES, 'run-1')
    s = runReducer(s, { type: 'check', value: 1 }) // wrong MCQ
    expect(s.feedback).toMatchObject({ correct: false, expected: 'suis', value: 1 })
    expect(s.queue).toEqual(['ex_1', 'ex_2', 'ex_3', 'ex_1'])
    expect(doneCount(s)).toBe(0)

    s = runReducer(s, { type: 'continue' })
    expect(currentExercise(s).id).toBe('ex_2')
    expect(s.retry).toBe(false)
    s = play(s, 'est', { mistakes: 2 })
    // Every exercise has a first attempt: the score is final while ex_1 is retried
    expect(isScoreFinal(s)).toBe(true)
    expect(s.phase).toBe('play')
    expect(currentExercise(s).id).toBe('ex_1')
    expect(s.retry).toBe(true)

    s = play(s, 0)
    expect(s.phase).toBe('done')
    expect(doneCount(s)).toBe(3)
    expect(firstAnswers(s)).toEqual([
      { exerciseId: 'ex_1', value: 1 },
      { exerciseId: 'ex_2', value: 'est' },
      { exerciseId: 'ex_3', value: { mistakes: 2 } },
    ])
    expect(s.first.map((a) => a.correct)).toEqual([false, true, false])
  })

  it('never re-queues a match, even with mistakes', () => {
    const s = runReducer(createRun([EXERCISES[2]], 'r'), { type: 'check', value: { mistakes: 3 } })
    expect(s.queue).toEqual(['ex_3'])
    expect(runReducer(s, { type: 'continue' }).phase).toBe('done')
  })

  it('ignores a second Check or Continue (double clicks)', () => {
    const checked = runReducer(createRun(EXERCISES, 'r'), { type: 'check', value: 1 })
    expect(runReducer(checked, { type: 'check', value: 0 })).toBe(checked)
    const next = runReducer(checked, { type: 'continue' })
    expect(runReducer(next, { type: 'continue' })).toBe(next)
  })

  it('does not change the answer once graded', () => {
    const checked = runReducer(createRun(EXERCISES, 'r'), { type: 'check', value: 2 })
    expect(runReducer(checked, { type: 'answer', value: 0 })).toBe(checked)
  })
})

describe('snapshots (resume after reload)', () => {
  it('round-trips a run in progress, including the graded screen', () => {
    let s = createRun(EXERCISES, 'run-1')
    s = runReducer(s, { type: 'check', value: 1 }) // wrong, feedback shown
    const snap = JSON.parse(JSON.stringify(toSnapshot(s, { status: 'idle' })))
    expect(snap.queue).toEqual(['ex_2', 'ex_3', 'ex_1'])

    const restored = restoreRun(EXERCISES, snap)
    expect(restored.save).toBeNull()
    expect(restored.state.runId).toBe('run-1')
    expect(currentExercise(restored.state).id).toBe('ex_2')
    expect(restored.state.resumed).toBe(true)
    expect(doneCount(restored.state)).toBe(0)
  })

  it('resumes straight to the end screen and keeps the saved result', () => {
    const s = play(createRun(EXERCISES, 'run-1'), 0, 'est', { mistakes: 0 })
    const restored = restoreRun(EXERCISES, toSnapshot(s, { status: 'saved', result: { score: 3, total: 3 } }))
    expect(restored.state.phase).toBe('done')
    expect(restored.save).toMatchObject({ status: 'saved', result: { score: 3, total: 3 } })
  })

  it('rejects snapshots that do not match the exercises', () => {
    const s = runReducer(createRun(EXERCISES, 'r'), { type: 'check', value: 0 })
    const snap = toSnapshot(s, { status: 'idle' })
    const edited = EXERCISES.map((e) => (e.id === 'ex_2' ? { ...e, answers: ['sont'] } : e))
    expect(restoreRun(edited, snap)).toBeNull()
    expect(restoreRun(EXERCISES, { ...snap, queue: ['ex_3'] })).toBeNull() // ex_2 lost
    expect(restoreRun(EXERCISES, { ...snap, queue: ['ex_2', 'ex_2', 'ex_3'] })).toBeNull()
    expect(restoreRun(EXERCISES, { ...snap, v: 99 })).toBeNull()
    expect(restoreRun(EXERCISES, null)).toBeNull()
    expect(restoreRun(EXERCISES, 'garbage')).toBeNull()
  })

  it('fingerprints exercises by content', () => {
    expect(fingerprint(EXERCISES)).toBe(fingerprint(JSON.parse(JSON.stringify(EXERCISES))))
    expect(fingerprint(EXERCISES)).not.toBe(fingerprint(EXERCISES.slice(1)))
  })
})

describe('newRunId', () => {
  it('returns distinct v4 UUIDs', () => {
    const a = newRunId()
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(newRunId()).not.toBe(a)
  })
})

describe('exercise text helpers', () => {
  it('splits a sentence around its blank, whatever its spelling', () => {
    expect(splitBlank('Je ___ allé.')).toEqual(['Je ', ' allé.'])
    expect(splitBlank('Je ____ allé.')).toEqual(['Je ', ' allé.'])
    expect(splitBlank('Je [blank] allé.')).toEqual(['Je ', ' allé.'])
    expect(splitBlank('Pick the correct sentence.')).toBeNull()
  })

  it('builds the text read aloud', () => {
    expect(speakable('Je ___ **allé**.')).toBe('Je … allé.')
    expect(speakable('Je ___ allé.', '**suis**')).toBe('Je suis allé.')
    expect(plainText('**mot** clé')).toBe('mot clé')
  })

  it('tells French sentences from English ones', () => {
    expect(isLikelyFrench('Le concert était complet.')).toBe(true)
    expect(isLikelyFrench('Ils sont partis tôt.')).toBe(true)
    expect(isLikelyFrench('Pick the correct sentence.')).toBe(false)
    expect(isLikelyFrench('The concert was sold out.')).toBe(false)
  })
})
