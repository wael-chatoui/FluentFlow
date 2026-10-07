import { describe, expect, it } from 'vitest'
import { playableExercises } from '@/components/practice/utils'
import { normalizeExercisesForEdit } from '@/utils/lesson/schema'
import { createRun, runReducer } from '@/components/practice/runState'

describe('exercise reporting and deactivation', () => {
  const sampleExercises = [
    {
      id: 'ex_1',
      type: 'mcq',
      prompt: 'Pick the answer',
      sentence: 'C’est ___ chat.',
      choices: ['un', 'une', 'des'],
      answer: 0,
    },
    {
      id: 'ex_2',
      type: 'fill_blank',
      prompt: 'Fill the blank',
      sentence: 'Elle ___ arrivée.',
      answers: ['est'],
      disabled: true,
      reported: { reason: 'Confusing', note: 'Not clear' },
    },
    {
      id: 'ex_3',
      type: 'match',
      prompt: 'Match pairs',
      pairs: [
        { fr: 'chat', en: 'cat' },
        { fr: 'chien', en: 'dog' },
        { fr: 'oiseau', en: 'bird' },
      ],
    },
  ]

  it('playableExercises filters out exercises with disabled: true', () => {
    const playable = playableExercises(sampleExercises)
    expect(playable.length).toBe(2)
    expect(playable.map((e) => e.id)).toEqual(['ex_1', 'ex_3'])
  })

  it('normalizeExercisesForEdit preserves disabled and reported attributes', () => {
    const normalized = normalizeExercisesForEdit(sampleExercises)
    const ex2 = normalized.find((e) => e.id === 'ex_2')
    expect(ex2).toBeDefined()
    expect(ex2.disabled).toBe(true)
    expect(ex2.reported).toEqual({ reason: 'Confusing', note: 'Not clear' })
  })

  it('runReducer removes reported exercise from active session queue and items', () => {
    const exercises = [
      { id: 'ex_1', type: 'mcq', prompt: 'P1', sentence: '___', choices: ['a', 'b', 'c'], answer: 0 },
      { id: 'ex_2', type: 'mcq', prompt: 'P2', sentence: '___', choices: ['a', 'b', 'c'], answer: 0 },
      { id: 'ex_3', type: 'mcq', prompt: 'P3', sentence: '___', choices: ['a', 'b', 'c'], answer: 0 },
    ]

    let state = createRun(exercises, 'test-run')
    expect(state.queue).toEqual(['ex_1', 'ex_2', 'ex_3'])
    expect(state.pos).toBe(0)

    // Report currently active exercise ex_1
    state = runReducer(state, { type: 'report_exercise', exerciseId: 'ex_1' })

    expect(state.items.map((e) => e.id)).toEqual(['ex_2', 'ex_3'])
    expect(state.queue).toEqual(['ex_2', 'ex_3'])
    expect(state.pos).toBe(0)
    expect(state.queue[state.pos]).toBe('ex_2')
    expect(state.phase).toBe('play')

    // Report remaining exercises
    state = runReducer(state, { type: 'report_exercise', exerciseId: 'ex_2' })
    state = runReducer(state, { type: 'report_exercise', exerciseId: 'ex_3' })

    expect(state.queue).toEqual([])
    expect(state.phase).toBe('done')
  })
})
