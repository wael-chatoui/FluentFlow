import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  DEFAULT_OPTIONS,
  autoOptions,
  draftOptions,
  hasOptionErrors,
  optionsChanged,
  optionsFromStored,
  optionsSummary,
  optionsToSend,
} from '@/components/teacher/lessons/OptionsDisclosure'
import { generationStartedAt } from '@/components/teacher/lessons/GenerationPanels'
import { pasteMessage } from '@/components/teacher/lessons/SourceInput'
import { overLimitFields } from '@/components/teacher/StudentProfileForm'
import { missingStudentAction, readDraft, writeDraft } from '@/components/teacher/lessonDraft'
import { readClipboardText } from '@/components/teacher/clipboard'

const ALL_TYPES = ['mcq', 'fill_blank', 'match']

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  }
}

describe('exercise options: « Laisser l’IA choisir » vs fixed count', () => {
  it('a new lesson lets the AI choose: nothing is sent and the summary says 10 to 14', () => {
    const value = autoOptions()
    expect(optionsToSend(value)).toBeNull()
    expect(optionsSummary(value, true)).toMatch(/10 à 14/)
  })

  it('exactly 10 exercises can be requested once the teacher fixes the settings', () => {
    const fixed = { ...autoOptions(), auto: false }
    expect(optionsToSend(fixed)).toEqual({ count: 10, types: ALL_TYPES })
    // What is shown is what is asked: no « Par défaut » on a fixed value of a form offering the AI's choice
    expect(optionsSummary(fixed, true)).toBe('10 exercices · QCM, Texte à trous, Association')
  })

  it('keeps « Par défaut » for fixed defaults where the AI cannot choose (imports)', () => {
    expect(optionsSummary(optionsFromStored(null), false)).toMatch(/^Par défaut : 10 exercices/)
  })

  it('ignores hidden invalid settings while the AI chooses', () => {
    expect(hasOptionErrors({ ...DEFAULT_OPTIONS, count: '', auto: true })).toBe(false)
    expect(hasOptionErrors({ ...DEFAULT_OPTIONS, count: '', auto: false })).toBe(true)
  })

  it('reads stored options: none means "AI chooses" only for transcript lessons', () => {
    expect(optionsFromStored(null, { auto: true }).auto).toBe(true)
    expect(optionsFromStored(null).auto).toBe(false)
    expect(optionsFromStored({ count: 12, types: ['mcq'], instructions: 'x' }, { auto: true })).toEqual({
      count: '12',
      types: ['mcq'],
      instructions: 'x',
      auto: false,
    })
  })

  it('regeneration sends options when leaving the AI choice, even for the default values', () => {
    const initial = optionsFromStored(null, { auto: true })
    expect(optionsChanged(initial, initial)).toBe(false)
    expect(optionsChanged({ ...initial, auto: false }, initial)).toBe(true)
    const stored = optionsFromStored({ count: 8, types: ALL_TYPES })
    expect(optionsChanged(stored, stored)).toBe(false)
    expect(optionsChanged({ ...stored, count: '9' }, stored)).toBe(true)
  })

  it('reads drafts saved before `auto` existed (unchanged defaults were not sent)', () => {
    expect(draftOptions(null).auto).toBe(true)
    expect(draftOptions({ ...DEFAULT_OPTIONS }).auto).toBe(true)
    expect(draftOptions({ ...DEFAULT_OPTIONS, count: '6' }).auto).toBe(false)
    expect(draftOptions({ ...DEFAULT_OPTIONS, auto: false }).auto).toBe(false)
  })
})

describe('lesson drafts', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: memoryStorage() })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const base = {
    title: '',
    transcript: 'Bonjour, nous avons parlé de Lyon.',
    canva: '',
    lessonDate: '2026-09-28',
    clientKey: '6f1c2b1e-3a4d-4c5e-8f60-718293a4b5c6',
    submittedAt: 0,
  }

  it('keeps the « Laisser l’IA choisir » flag of the options', () => {
    writeDraft('', { ...base, options: { ...DEFAULT_OPTIONS, auto: false } })
    expect(readDraft('').options.auto).toBe(false)
    writeDraft('', { ...base, options: { ...DEFAULT_OPTIONS } })
    expect(readDraft('').options).not.toHaveProperty('auto')
  })

  it('never lets a missing ?student= form erase or overwrite the unassigned draft', () => {
    const empty = { ...base, transcript: '' }
    const unassigned = { ...base, transcript: 'Transcription collée sans élève.' }
    expect(missingStudentAction(empty, unassigned)).toBe('restore')
    expect(missingStudentAction(base, unassigned)).toBe('conflict')
    expect(missingStudentAction(base, null)).toBe('move')
    expect(missingStudentAction(empty, null)).toBe('reset')
  })
})

describe('generation timer start', () => {
  const now = Date.parse('2026-09-30T10:05:00Z')

  it('keeps the first start seen when a PATCH bumps updated_at during the run', () => {
    const first = Date.parse('2026-09-30T10:00:00Z')
    const edited = { status: 'generating', updated_at: '2026-09-30T10:01:10Z' }
    expect(generationStartedAt(edited, first, now)).toBe(first)
  })

  it('prefers the server generation_started_at when the API sends it', () => {
    const lesson = { updated_at: '2026-09-30T10:04:00Z', generation_started_at: '2026-09-30T10:00:00Z' }
    expect(generationStartedAt(lesson, Date.parse('2026-09-30T10:02:00Z'), now)).toBe(Date.parse('2026-09-30T10:00:00Z'))
  })

  it('falls back to updated_at, never in the future, and null when unknown', () => {
    expect(generationStartedAt({ updated_at: '2026-09-30T10:03:00Z' }, null, now)).toBe(Date.parse('2026-09-30T10:03:00Z'))
    expect(generationStartedAt({ updated_at: '2026-09-30T11:00:00Z' }, null, now)).toBe(now)
    expect(generationStartedAt({ updated_at: null }, null, now)).toBeNull()
  })
})

describe('« Coller » button', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('tells an empty clipboard from an unreadable one', async () => {
    vi.stubGlobal('navigator', { clipboard: { readText: async () => '' } })
    expect(await readClipboardText()).toBe('')
    vi.stubGlobal('navigator', { clipboard: { readText: async () => Promise.reject(new Error('denied')) } })
    expect(await readClipboardText()).toBeNull()
    vi.stubGlobal('navigator', {})
    expect(await readClipboardText()).toBeNull()
  })

  it('says what happened', () => {
    expect(pasteMessage(null)).toMatch(/inaccessible/)
    expect(pasteMessage('')).toMatch(/ne contient pas de texte/)
    expect(pasteMessage('  \n')).toMatch(/ne contient pas de texte/)
    expect(pasteMessage('Bonjour')).toMatch(/^Collé ✓/)
  })
})

describe('student profile form limits (same as the API)', () => {
  it('flags goals and interests above 1000 characters, not only notes and AI context', () => {
    const ok = { goals: 'a'.repeat(1000), interests: '', aiContext: '', notes: '' }
    expect(overLimitFields(ok)).toEqual([])
    expect(overLimitFields({ ...ok, goals: 'a'.repeat(1001), interests: 'b'.repeat(1001) })).toEqual(['goals', 'interests'])
    expect(overLimitFields({ ...ok, aiContext: 'c'.repeat(4001), notes: 'd'.repeat(10_001) })).toEqual(['aiContext', 'notes'])
  })
})
