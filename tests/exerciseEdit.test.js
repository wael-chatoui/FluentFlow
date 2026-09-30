import { describe, expect, it } from 'vitest'
import { countBlanks, exerciseErrors, fromEditable, toEditable } from '@/components/teacher/lessons/exerciseEdit'
import { normalizeExercisesForEdit } from '@/utils/lesson/schema'

const mcq = { id: 'ex_1', type: 'mcq', prompt: 'Choose', sentence: 'Je ___ au cinéma.', choices: ['vais', 'va', 'allons'], answer: 0, explanation: '' }
const fill = { id: 'ex_2', type: 'fill_blank', prompt: 'Fill', sentence: 'Hier, je ___ allé.', answers: ['suis', 'étais'], hint: 'être', explanation: '' }
const match = {
  id: 'ex_3',
  type: 'match',
  prompt: 'Match',
  pairs: [
    { fr: 'chat', en: 'cat' },
    { fr: 'chien', en: 'dog' },
    { fr: 'oiseau', en: 'bird' },
  ],
  explanation: '',
}

// What the API keeps after validation (it silently drops invalid exercises)
const serverKeeps = (exercise) => normalizeExercisesForEdit([exercise]).length === 1

describe('toEditable / fromEditable', () => {
  it.each([mcq, fill, match])('round-trips a valid $type exercise', (exercise) => {
    const back = fromEditable(toEditable(exercise))
    expect(exerciseErrors(toEditable(exercise))).toEqual({})
    expect(back).toMatchObject({ id: exercise.id, type: exercise.type })
    expect(serverKeeps(back)).toBe(true)
    expect(normalizeExercisesForEdit([back])[0].id).toBe(exercise.id)
  })
  it('turns fill-blank answers into one per line and back, dropping blank lines', () => {
    const draft = toEditable(fill)
    expect(draft.answersText).toBe('suis\nétais')
    expect(fromEditable({ ...draft, answersText: ' suis \n\n étais ' }).answers).toEqual(['suis', 'étais'])
  })
})

describe('exerciseErrors mirrors the API validation', () => {
  const cases = [
    ['mcq with duplicate choices', { ...toEditable(mcq), choices: ['vais', 'Vais', 'allons'] }, 'choices'],
    ['mcq with an empty choice', { ...toEditable(mcq), choices: ['vais', ' ', 'allons'] }, 'choices'],
    ['mcq without sentence', { ...toEditable(mcq), sentence: '  ' }, 'sentence'],
    ['fill-blank without blank', { ...toEditable(fill), sentence: 'Hier, je suis allé.' }, 'sentence'],
    ['fill-blank with two blanks', { ...toEditable(fill), sentence: '___ et ___' }, 'sentence'],
    ['fill-blank without answer', { ...toEditable(fill), answersText: '\n ' }, 'answers'],
    ['match with 2 pairs', { ...toEditable(match), pairs: match.pairs.slice(0, 2) }, 'pairs'],
    ['match with a duplicate word', { ...toEditable(match), pairs: [...match.pairs, { fr: 'Chat', en: 'kitty' }] }, 'pairs'],
    ['mcq with two blanks', { ...toEditable(mcq), sentence: 'Je ___ au ___.' }, 'sentence'],
    ['mcq choices equal once ** is removed', { ...toEditable(mcq), choices: ['vais', '**vais**', 'allons'] }, 'choices'],
    ['mcq choice made only of **', { ...toEditable(mcq), choices: ['vais', '****', 'allons'] }, 'choices'],
    ['match pair equal once ** is removed', { ...toEditable(match), pairs: [...match.pairs, { fr: '**chat**', en: 'kitty' }] }, 'pairs'],
  ]
  it.each(cases)('%s', (_label, draft, field) => {
    expect(exerciseErrors(draft)).toHaveProperty(field)
    expect(serverKeeps(fromEditable(draft))).toBe(false)
  })
  it('flags an incomplete pair that the API would silently drop', () => {
    const draft = { ...toEditable(match), pairs: [...match.pairs, { fr: 'lapin', en: '' }] }
    expect(exerciseErrors(draft)).toHaveProperty('pairs')
    expect(normalizeExercisesForEdit([fromEditable(draft)])[0].pairs).toHaveLength(3)
  })
  it('accepts an mcq whose sentence is the question itself (no blank), like the API', () => {
    const draft = { ...toEditable(mcq), sentence: 'Comment dit-on « I go » ?' }
    expect(exerciseErrors(draft)).toEqual({})
    expect(serverKeeps(fromEditable(draft))).toBe(true)
  })
  it('sends choices and answers without ** (as the API stores them)', () => {
    expect(fromEditable({ ...toEditable(mcq), choices: ['**vais**', 'va', 'allons'] }).choices[0]).toBe('vais')
    expect(fromEditable({ ...toEditable(fill), answersText: '**suis**' }).answers).toEqual(['suis'])
  })
  it('accepts [blank] and ____ as the blank, like the API', () => {
    expect(countBlanks('Je [blank] là')).toBe(1)
    expect(countBlanks('Je ____ là')).toBe(1)
    expect(exerciseErrors({ ...toEditable(fill), sentence: 'Hier, je ____ allé.' })).toEqual({})
  })
})
