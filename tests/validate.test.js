import { describe, expect, it } from 'vitest'
import { BadRequest } from '@/utils/api/errors'
import {
  LIMITS,
  optionalBoolean,
  parseClientKey,
  parseGenerationOptions,
  parseSourceName,
  validateImportText,
  validateSources,
} from '@/utils/api/validate'
import { MAX_CANVA, MAX_TRANSCRIPT } from '@/utils/ai/options'
import { IMPORT_LIMITS } from '@/utils/import/limits'

const sentence = 'Aujourd’hui nous avons parlé du week-end à Lyon et du passé composé. '

function messageOf(fn) {
  try {
    fn()
  } catch (err) {
    expect(err).toBeInstanceOf(BadRequest)
    return err.message
  }
  throw new Error('expected a BadRequest')
}

describe('LIMITS', () => {
  it('matches the prompt limits', () => {
    expect(LIMITS.transcript).toBe(MAX_TRANSCRIPT)
    expect(LIMITS.canva).toBe(MAX_CANVA)
  })

  it('shares the title and document name limits with the import page', () => {
    expect(LIMITS.sourceName).toBe(IMPORT_LIMITS.maxSourceName)
    expect(LIMITS.title).toBe(IMPORT_LIMITS.maxTitle)
  })
})

describe('validateSources', () => {
  it('trims and accepts one usable source', () => {
    expect(validateSources(`  ${sentence} `, undefined)).toEqual({ transcript: sentence.trim(), canva: '' })
  })

  it('needs at least a few sentences', () => {
    expect(messageOf(() => validateSources('Bonjour', ''))).toMatch(/au moins quelques phrases/)
  })

  it('refuses a transcript longer than the prompt limit with a French message', () => {
    const long = 'a'.repeat(MAX_TRANSCRIPT + 1)
    expect(messageOf(() => validateSources(long, ''))).toMatch(/^La transcription est trop longue : 120\s001 caractères pour 120\s000 au maximum/)
  })

  it('refuses long Canva notes', () => {
    expect(messageOf(() => validateSources(sentence, 'b'.repeat(MAX_CANVA + 5)))).toMatch(/^Les notes Canva sont trop longues/)
  })

  it('skips the length check for stored text', () => {
    const long = `${sentence}${'a'.repeat(MAX_TRANSCRIPT)}`
    expect(validateSources(long, '', { stored: ['transcript'] }).transcript).toHaveLength(long.trim().length)
  })

  it('refuses non-string sources', () => {
    expect(messageOf(() => validateSources(42, sentence))).toBe('La transcription doit être du texte.')
  })
})

describe('validateImportText', () => {
  it('bounds the document text', () => {
    expect(messageOf(() => validateImportText('court'))).toMatch(/trop court/)
    expect(messageOf(() => validateImportText('x'.repeat(LIMITS.document + 1)))).toMatch(/trop long/)
    expect(validateImportText(`  ${'x'.repeat(300)}  `)).toHaveLength(300)
  })
})

describe('parseSourceName', () => {
  it('trims and cuts to the limit instead of refusing', () => {
    expect(parseSourceName('  recap.pdf ')).toBe('recap.pdf')
    expect(parseSourceName('n'.repeat(300))).toHaveLength(LIMITS.sourceName)
    expect(parseSourceName('   ')).toBeNull()
    expect(parseSourceName(undefined)).toBeNull()
  })
})

describe('parseClientKey', () => {
  it('requires a UUID and lower-cases it', () => {
    expect(parseClientKey('5F0C6B1E-2D3A-4B5C-8D9E-0A1B2C3D4E5F')).toBe('5f0c6b1e-2d3a-4b5c-8d9e-0a1b2c3d4e5f')
    expect(messageOf(() => parseClientKey(undefined))).toMatch(/clientKey/)
    expect(messageOf(() => parseClientKey('not-a-uuid'))).toMatch(/clientKey/)
  })
})

describe('optionalBoolean', () => {
  it('accepts booleans only', () => {
    expect(optionalBoolean(undefined, 'x')).toBeUndefined()
    expect(optionalBoolean(false, 'x')).toBe(false)
    expect(messageOf(() => optionalBoolean('true', 'Invalide.'))).toBe('Invalide.')
  })
})

describe('parseGenerationOptions', () => {
  it('fills defaults', () => {
    expect(parseGenerationOptions({})).toEqual({ count: 10, types: ['mcq', 'fill_blank', 'match'], instructions: '' })
    expect(parseGenerationOptions(undefined)).toBeUndefined()
  })

  it('dedupes types in the canonical order', () => {
    expect(parseGenerationOptions({ types: ['match', 'mcq', 'match'] }).types).toEqual(['mcq', 'match'])
  })

  it('refuses bad values', () => {
    expect(messageOf(() => parseGenerationOptions({ count: 3 }))).toMatch(/entre 4 et 20/)
    expect(messageOf(() => parseGenerationOptions({ count: 5.5 }))).toMatch(/entre 4 et 20/)
    expect(messageOf(() => parseGenerationOptions({ types: ['essay'] }))).toMatch(/inconnu/)
    expect(messageOf(() => parseGenerationOptions({ types: [] }))).toMatch(/au moins un type/)
    expect(messageOf(() => parseGenerationOptions([]))).toMatch(/invalides/)
  })
})
