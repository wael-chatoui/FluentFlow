import { describe, expect, it } from 'vitest'
import {
  MANUAL_FAILURE,
  STUCK_FAILURE,
  errorForStatus,
  exercisesResetProgress,
  generationBlock,
  invalidExercisePositions,
} from '@/utils/api/admin/lessonEdit'
import { STALE_GENERATION_MS, normalizeExercisesForEdit } from '@/utils/lesson/schema'
import {
  buildPatch,
  exercisesResetProgress as draftResetsProgress,
  toDraft,
  validateDraft,
} from '@/components/admin/lessons/editorModel'

// Exercises saved before the normalizer rewrote ____ / [blank] and stripped ** from answers
const legacy = [
  {
    id: 'ex_1',
    type: 'mcq',
    prompt: 'Choose the right answer',
    sentence: 'Je ____ au marché.',
    choices: ['va', 'vais', 'vont'],
    answer: 1,
    explanation: '',
  },
  { id: 'ex_2', type: 'fill_blank', prompt: 'Fill in the blank', sentence: 'Tu ___ là.', answers: ['**es**'], hint: '', explanation: '' },
  {
    id: 'ex_3',
    type: 'match',
    prompt: 'Match the pairs',
    pairs: [
      { fr: 'chat', en: 'cat' },
      { fr: 'chien', en: 'dog' },
      { fr: 'oiseau', en: 'bird' },
    ],
    explanation: '',
  },
]
const twoBlanks = { ...legacy[0], id: 'ex_4', sentence: 'Je ___ et tu ___.' }

// What the API does with a full exercises array (pages/api/admin/lessons/[id].js)
const serverSave = (stored, sent) =>
  normalizeExercisesForEdit(sent, { reservedIds: stored.map((e) => e.id), stored })

const lesson = (exercises) => ({
  title: 'Leçon',
  lesson_date: '2026-09-30',
  status: 'published',
  student_id: 'abc',
  hidden: false,
  drive_url: '',
  content: { title: 'Recap' },
  exercises,
})

describe('progress reset on exercises saved under older rules', () => {
  it('does not reset when legacy exercises are only removed or reordered', () => {
    const removed = serverSave(legacy, legacy.slice(0, 2))
    expect(exercisesResetProgress(legacy, removed)).toBe(false)
    expect(exercisesResetProgress(legacy, serverSave(legacy, [legacy[2], legacy[0], legacy[1]]))).toBe(false)
    // Even if the normalizer rewrote them (no `stored` given): compared in normalized form
    expect(exercisesResetProgress(legacy, normalizeExercisesForEdit(legacy.slice(0, 2)))).toBe(false)
  })

  it('still resets for a real edit or an added exercise', () => {
    const edited = serverSave(legacy, [{ ...legacy[0], answer: 2 }, legacy[1]])
    expect(exercisesResetProgress(legacy, edited)).toBe(true)
    const added = serverSave(legacy, [...legacy, { ...legacy[2], id: undefined, pairs: legacy[2].pairs.slice().reverse() }])
    expect(exercisesResetProgress(legacy, added)).toBe(true)
  })

  it('gives the editor the same answer as the server', () => {
    const original = toDraft(lesson(legacy))
    const draft = { ...original, exercises: original.exercises.slice(0, 2) }
    const sent = buildPatch(draft, ['exercises']).exercises
    expect(draftResetsProgress(draft.exercises, original.exercises)).toBe(false)
    expect(exercisesResetProgress(legacy, serverSave(legacy, sent))).toBe(false)

    const changed = { ...original, exercises: [{ ...original.exercises[1], answers: ['es', 'étais'] }] }
    expect(draftResetsProgress(changed.exercises, original.exercises)).toBe(true)
    expect(exercisesResetProgress(legacy, serverSave(legacy, buildPatch(changed, ['exercises']).exercises))).toBe(true)
  })
})

describe('exercise checks of the editor match the server', () => {
  it('flags an MCQ sentence with several blanks', () => {
    const draft = toDraft(lesson([{ ...twoBlanks, id: undefined }]))
    expect(validateDraft(draft)['exercises.0.sentence']).toMatch(/Au plus un ___/)
    expect(invalidExercisePositions(buildPatch(draft, ['exercises']).exercises)).toEqual([1])
  })

  it('accepts a legacy exercise left as stored, on both sides', () => {
    const stored = [legacy[0], twoBlanks]
    const draft = toDraft(lesson(stored))
    const kept = { ...draft, exercises: [draft.exercises[1]] } // ex_1 removed, ex_4 untouched
    expect(validateDraft(kept, { storedExercises: stored })).toEqual({})
    const sent = buildPatch(kept, ['exercises']).exercises
    expect(invalidExercisePositions(sent, { stored })).toEqual([])
    expect(serverSave(stored, sent)).toEqual([twoBlanks])

    // Once edited, it must follow the current rules
    const edited = { ...draft, exercises: [{ ...draft.exercises[1], explanation: 'Présent' }] }
    expect(validateDraft(edited, { storedExercises: stored })['exercises.0.sentence']).toMatch(/Au plus un/)
    expect(invalidExercisePositions(buildPatch(edited, ['exercises']).exercises, { stored })).toEqual([1])
  })

  it('treats ** alone as empty in choices, answers and pairs', () => {
    const exercises = [
      { ...legacy[0], id: undefined, choices: ['va', '**', 'vont'] },
      { ...legacy[1], id: undefined, answers: ['****'] },
      { ...legacy[2], id: undefined, pairs: [...legacy[2].pairs, { fr: '**', en: 'fish' }] },
    ]
    const errors = validateDraft(toDraft(lesson(exercises)))
    expect(errors['exercises.0.choices']).toBeTruthy()
    expect(errors['exercises.1.answers']).toBeTruthy()
    expect(errors['exercises.2.pairs.3']).toBeTruthy()
    expect(invalidExercisePositions(exercises)).toEqual([1, 2])
  })
})

describe('generationBlock', () => {
  const now = Date.parse('2026-09-30T12:00:00Z')
  const at = (ms) => new Date(now - ms).toISOString()
  const running = { status: 'generating', updated_at: at(60_000) }
  const stuck = { status: 'generating', updated_at: at(STALE_GENERATION_MS + 1000) }

  it('lets anything through outside a generation', () => {
    expect(generationBlock({ status: 'published', updated_at: at(0) }, { title: 'x' }, now)).toBeNull()
  })

  it('only lets the visibility change while a generation runs', () => {
    expect(generationBlock(running, { hidden: true }, now)).toBeNull()
    expect(generationBlock(running, { title: 'x' }, now)).toBe('generating')
    expect(generationBlock(running, { status: 'failed' }, now)).toBe('generating')
  })

  it('makes every save of a stuck generation give it a status', () => {
    expect(generationBlock(stuck, { title: 'x' }, now)).toBe('stuck')
    // Visibility alone too: it would refresh updated_at and hide the stuck state again
    expect(generationBlock(stuck, { hidden: true }, now)).toBe('stuck')
    expect(generationBlock(stuck, { title: 'x', status: 'published' }, now)).toBeNull()
    expect(generationBlock(stuck, { status: 'failed' }, now)).toBeNull()
  })
})

describe('errorForStatus', () => {
  it('clears the error when a lesson gets published', () => {
    expect(errorForStatus({ status: 'failed', error: 'AI down' }, 'published')).toBeNull()
    expect(errorForStatus({ status: 'generating', error: null }, 'published')).toBeNull()
  })

  it('gives a failed lesson a reason, keeping the recorded one', () => {
    expect(errorForStatus({ status: 'generating', error: null }, 'failed')).toBe(STUCK_FAILURE)
    expect(errorForStatus({ status: 'published', error: null }, 'failed')).toBe(MANUAL_FAILURE)
    expect(errorForStatus({ status: 'published', error: 'Régénération ratée' }, 'failed')).toBe('Régénération ratée')
  })

  it('leaves the error alone without a status change', () => {
    expect(errorForStatus({ status: 'published', error: 'x' }, undefined)).toBeUndefined()
    expect(errorForStatus({ status: 'published', error: 'x' }, 'published')).toBeUndefined()
  })
})
