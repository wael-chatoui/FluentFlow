import { describe, expect, it } from 'vitest'
import {
  EMPTY_ANSWERS,
  GOAL_OPTIONS,
  INTEREST_OPTIONS,
  PROFILE_TEXT_MAX,
  STEPS,
  freeTextMax,
  freeTextOverflow,
  levelLabel,
  parseChoices,
  serializeChoices,
  stepValidity,
  toPayload,
} from '@/components/onboarding/options'

const answers = (overrides) => ({ ...EMPTY_ANSWERS, fullName: 'Ana', level: 'B1', goals: ['travel'], ...overrides })

describe('onboarding choices (de)serialisation', () => {
  it('round-trips chips + free text', () => {
    const stored = serializeChoices(GOAL_OPTIONS, ['work', 'travel'], ' Pass the DELF B2 ')
    expect(stored).toBe('Travel, Work — Pass the DELF B2')
    expect(parseChoices(GOAL_OPTIONS, stored)).toEqual({ ids: ['travel', 'work'], text: 'Pass the DELF B2' })
  })

  it('keeps unknown text as free text, in full (no silent truncation)', () => {
    const long = 'x'.repeat(950)
    expect(parseChoices(GOAL_OPTIONS, long)).toEqual({ ids: [], text: long })
    const withChips = `Travel — ${'y'.repeat(980)}`
    expect(parseChoices(GOAL_OPTIONS, withChips).text).toHaveLength(980)
  })

  it('never cuts the stored value', () => {
    const text = 'z'.repeat(PROFILE_TEXT_MAX + 5)
    expect(serializeChoices(INTEREST_OPTIONS, [], text)).toHaveLength(PROFILE_TEXT_MAX + 5)
  })
})

describe('free text limit', () => {
  it('leaves room for the chip labels and the separator', () => {
    expect(freeTextMax(GOAL_OPTIONS, [])).toBe(PROFILE_TEXT_MAX)
    // 'Travel, Work' (12) + ' — ' (3)
    expect(freeTextMax(GOAL_OPTIONS, ['travel', 'work'])).toBe(PROFILE_TEXT_MAX - 15)
  })

  it('a text that fits the limit serialises within PROFILE_TEXT_MAX', () => {
    const ids = GOAL_OPTIONS.map((o) => o.id)
    const text = 'a'.repeat(freeTextMax(GOAL_OPTIONS, ids))
    expect(serializeChoices(GOAL_OPTIONS, ids, text)).toHaveLength(PROFILE_TEXT_MAX)
    expect(freeTextOverflow(GOAL_OPTIONS, ids, text)).toBe(0)
    expect(freeTextOverflow(GOAL_OPTIONS, ids, `${text}bc`)).toBe(2)
  })
})

describe('stepValidity', () => {
  it('requires a name, a level and at least one goal', () => {
    expect(stepValidity(answers())[STEPS.SUMMARY]).toBe(true)
    expect(stepValidity(answers({ fullName: '  ' }))[STEPS.NAME]).toBe(false)
    expect(stepValidity(answers({ level: 'Z9' }))[STEPS.LEVEL]).toBe(false)
    expect(stepValidity(answers({ goals: [] }))[STEPS.GOALS]).toBe(false)
    expect(stepValidity(answers({ goals: [], goalsText: 'Read Proust' }))[STEPS.GOALS]).toBe(true)
  })

  it('flags free text over the limit instead of truncating it', () => {
    const tooLong = answers({ interests: ['music'], interestsText: 'm'.repeat(PROFILE_TEXT_MAX) })
    const validity = stepValidity(tooLong)
    expect(validity[STEPS.INTERESTS]).toBe(false)
    expect(validity[STEPS.SUMMARY]).toBe(false)
    expect(stepValidity(answers({ goalsText: 'g'.repeat(PROFILE_TEXT_MAX) }))[STEPS.GOALS]).toBe(false)
  })
})

describe('payload and labels', () => {
  it('builds the /api/onboarding/complete body', () => {
    expect(toPayload(answers({ fullName: '  Ana Silva ', interests: ['food'], interestsText: '' }))).toEqual({
      fullName: 'Ana Silva',
      level: 'B1',
      goals: 'Travel',
      interests: 'Food & cooking',
    })
  })

  it('uses the shared level wording', () => {
    expect(levelLabel('B1')).toBe('B1 · Intermediate')
    expect(levelLabel('unknown')).toBe('Not sure')
    expect(levelLabel('')).toBe('')
  })
})
