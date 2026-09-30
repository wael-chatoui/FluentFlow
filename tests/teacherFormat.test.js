import { describe, expect, it } from 'vitest'
import {
  SOURCE_LIMITS,
  accountState,
  formatRelative,
  hasEnoughText,
  isStaleGeneration,
  lessonTitle,
  sourcesError,
} from '@/components/teacher/format'
import { LIMITS, hasEnoughText as serverHasEnoughText } from '@/utils/api/validate'

describe('source rules match the API', () => {
  const samples = ['', '   ', 'a b c d e f g h i j k', 'a'.repeat(19), 'a'.repeat(20), ' \n'.repeat(30) + 'x'.repeat(20), 'Bonjour, ça va très bien !']
  it.each(samples)('hasEnoughText(%j) agrees with the server', (value) => {
    expect(hasEnoughText(value)).toBe(serverHasEnoughText(value))
  })
  it('uses the same maximum lengths', () => {
    expect(SOURCE_LIMITS.transcript).toBe(LIMITS.transcript)
    expect(SOURCE_LIMITS.canva).toBe(LIMITS.canva)
  })
})

describe('sourcesError', () => {
  it('accepts one field with enough non-space characters', () => {
    expect(sourcesError('Bonjour, je m’appelle Emma et je suis anglaise.', '')).toBeNull()
    expect(sourcesError('', 'Notes : passé composé avec être')).toBeNull()
  })
  it('counts characters without spaces, like the API', () => {
    expect(sourcesError('a b c d e f g h i j k', '')).toMatch(/au moins 20 caractères/)
  })
  it('rejects a source over its maximum (measured after trim, like the API)', () => {
    expect(sourcesError('x'.repeat(SOURCE_LIMITS.transcript + 1), '')).toMatch(/trop longue/)
    expect(sourcesError(`  ${'x'.repeat(SOURCE_LIMITS.transcript)}  `, '')).toBeNull()
    expect(sourcesError('ok ok ok ok ok ok ok ok ok ok', 'y'.repeat(SOURCE_LIMITS.canva + 1))).toMatch(/trop longues/)
  })
  it('does not length-check unchanged stored sources (regeneration)', () => {
    expect(sourcesError('x'.repeat(SOURCE_LIMITS.transcript + 1), '', { stored: ['transcript'] })).toBeNull()
  })
})

describe('isStaleGeneration', () => {
  const now = Date.parse('2026-09-29T12:00:00Z')
  it('is false for lessons that are not generating', () => {
    expect(isStaleGeneration({ status: 'published', stale: true }, now)).toBe(false)
    expect(isStaleGeneration(null, now)).toBe(false)
  })
  it("trusts the API's stale flag", () => {
    expect(isStaleGeneration({ status: 'generating', stale: false, updated_at: '2026-09-29T10:00:00Z' }, now)).toBe(false)
    expect(isStaleGeneration({ status: 'generating', stale: true, updated_at: '2026-09-29T11:59:00Z' }, now)).toBe(true)
  })
  it('falls back to updated_at older than 5 minutes', () => {
    expect(isStaleGeneration({ status: 'generating', updated_at: '2026-09-29T11:56:00Z' }, now)).toBe(false)
    expect(isStaleGeneration({ status: 'generating', updated_at: '2026-09-29T11:54:00.123456+00:00' }, now)).toBe(true)
  })
})

describe('accountState', () => {
  it('flags accounts that never signed in when the API sends the field', () => {
    expect(accountState({ last_sign_in_at: null, onboarded_at: null })).toBe('invited')
  })
  it('falls back to onboarding when the field is absent', () => {
    expect(accountState({ onboarded_at: null })).toBe('profile')
    expect(accountState({ onboarded_at: '2026-01-01T00:00:00Z' })).toBe('active')
    expect(accountState({ last_sign_in_at: '2026-01-02T00:00:00Z', onboarded_at: null })).toBe('profile')
  })
})

describe('formatRelative', () => {
  const now = Date.parse('2026-09-29T12:00:00Z')
  it('formats recent times in French', () => {
    expect(formatRelative('2026-09-29T11:59:30Z', now)).toBe("à l'instant")
    expect(formatRelative('2026-09-29T11:55:00Z', now)).toBe('il y a 5 minutes')
    expect(formatRelative('2026-09-29T09:00:00Z', now)).toBe('il y a 3 heures')
    expect(formatRelative('2026-09-28T12:00:00Z', now)).toBe('hier')
  })
  it('falls back to a date after a week, and a dash when invalid', () => {
    expect(formatRelative('2026-09-01T12:00:00Z', now)).toMatch(/^le \d+ septembre 2026$/)
    expect(formatRelative('nope', now)).toBe('—')
  })
})

describe('lessonTitle', () => {
  it('prefers the teacher title, then the AI title', () => {
    expect(lessonTitle({ title: ' Mon titre ', content: { title: 'IA' } })).toBe('Mon titre')
    expect(lessonTitle({ title: null, content: { title: 'IA' } })).toBe('IA')
    expect(lessonTitle({})).toBe('Leçon sans titre')
  })
})
