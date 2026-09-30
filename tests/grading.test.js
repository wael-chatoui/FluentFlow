import { describe, expect, it } from 'vitest'
import { gradeAnswer, normalizeAnswer, scoreSession } from '@/utils/lesson/grading'

const fill = (answers) => ({ id: 'ex_1', type: 'fill_blank', sentence: 'x ___ y', answers })

describe('normalizeAnswer', () => {
  it('drops trailing punctuation even when followed by spaces', () => {
    expect(normalizeAnswer('Bonjour. ')).toBe('bonjour')
    expect(normalizeAnswer('  Bonjour !  ')).toBe('bonjour')
  })
  it('unifies apostrophes, quotes and markup', () => {
    expect(normalizeAnswer('l’eau')).toBe("l'eau")
    expect(normalizeAnswer('« suis »')).toBe('suis')
    expect(normalizeAnswer('**suis**')).toBe('suis')
  })
})

describe('gradeAnswer fill_blank', () => {
  it('accepts exact answers, case-insensitive', () => {
    expect(gradeAnswer(fill(['suis']), 'Suis')).toMatchObject({ correct: true, accentWarning: false })
  })
  it('accepts **highlighted** answer keys', () => {
    expect(gradeAnswer(fill(['**suis**']), 'suis')).toMatchObject({ correct: true, expected: 'suis' })
  })
  it('rejects accent minimal pairs (a/à, ou/où, la/là, du/dû)', () => {
    expect(gradeAnswer(fill(['à']), 'a').correct).toBe(false)
    expect(gradeAnswer(fill(['a']), 'à').correct).toBe(false)
    expect(gradeAnswer(fill(['où']), 'ou').correct).toBe(false)
    expect(gradeAnswer(fill(['là']), 'la').correct).toBe(false)
    expect(gradeAnswer(fill(['sûr']), 'sur').correct).toBe(false)
  })
  it('rejects a missing accent on the last letter (parlé / parle)', () => {
    expect(gradeAnswer(fill(['parlé']), 'parle').correct).toBe(false)
    expect(gradeAnswer(fill(['allée']), 'allee').correct).toBe(false)
  })
  it('accepts other accent slips with a warning', () => {
    expect(gradeAnswer(fill(['élève']), 'eleve')).toEqual({ correct: true, accentWarning: true, expected: 'élève' })
    expect(gradeAnswer(fill(['préfère']), 'prefere')).toMatchObject({ correct: true, accentWarning: true })
  })
  it('shows the near answer when the accent makes it wrong', () => {
    expect(gradeAnswer(fill(['vais', 'à']), 'a')).toMatchObject({ correct: false, expected: 'à' })
  })
  it('treats ligatures and hyphens as equivalent typings', () => {
    expect(gradeAnswer(fill(['sœur']), 'soeur')).toMatchObject({ correct: true, accentWarning: false })
    expect(gradeAnswer(fill(['peut-être']), 'peut être')).toMatchObject({ correct: true, accentWarning: false })
    expect(gradeAnswer(fill(['peut-être']), 'peut etre')).toMatchObject({ correct: true, accentWarning: true })
  })
  it('rejects empty answers', () => {
    expect(gradeAnswer(fill(['suis']), '   ').correct).toBe(false)
  })
})

describe('gradeAnswer mcq / match', () => {
  const mcq = { id: 'ex_2', type: 'mcq', sentence: 's', choices: ['a', 'b', '**c**'], answer: 2 }
  it('grades by index only', () => {
    expect(gradeAnswer(mcq, 2)).toEqual({ correct: true, accentWarning: false, expected: 'c' })
    expect(gradeAnswer(mcq, '2').correct).toBe(false)
    expect(gradeAnswer(mcq, 1).correct).toBe(false)
  })
  it('match is correct with zero mistakes', () => {
    const match = { id: 'ex_3', type: 'match', pairs: [] }
    expect(gradeAnswer(match, { mistakes: 0 }).correct).toBe(true)
    expect(gradeAnswer(match, { mistakes: 2 }).correct).toBe(false)
    expect(gradeAnswer(match, {}).correct).toBe(false)
  })
  it('unknown types are wrong', () => {
    expect(gradeAnswer({ type: 'constructor' }, 1).correct).toBe(false)
  })
})

describe('scoreSession', () => {
  it('counts only the first answer per exercise and totals every exercise', () => {
    const exercises = [fill(['suis']), { id: 'ex_2', type: 'mcq', sentence: 's', choices: ['a', 'b', 'c'], answer: 0 }]
    const result = scoreSession(exercises, [
      { exerciseId: 'ex_1', value: 'es' },
      { exerciseId: 'ex_1', value: 'suis' },
      { exerciseId: 'ex_2', value: 0 },
      { exerciseId: 'nope', value: 0 },
    ])
    expect(result.score).toBe(1)
    expect(result.total).toBe(2)
    expect(result.answers).toHaveLength(2)
  })
})
