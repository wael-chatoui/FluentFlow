import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { newClientKey, readDraft, readPref, removeDraft, writeDraft, writePref } from '@/components/teacher/lessonDraft'

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

function memoryStorage() {
  const map = new Map()
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
  }
}

beforeEach(() => {
  vi.stubGlobal('window', { localStorage: memoryStorage() })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('newClientKey', () => {
  it('returns a v4 uuid', () => {
    expect(newClientKey()).toMatch(UUID_V4)
  })
  it('falls back to getRandomValues when randomUUID is missing (http on a LAN IP)', () => {
    const real = globalThis.crypto
    vi.stubGlobal('crypto', { getRandomValues: (a) => real.getRandomValues(a) })
    expect(newClientKey()).toMatch(UUID_V4)
  })
})

describe('drafts', () => {
  const draft = {
    title: '',
    transcript: 'Bonjour, aujourd’hui nous avons parlé de Lyon.',
    canva: '',
    lessonDate: '2026-09-28',
    clientKey: '6f1c2b1e-3a4d-4c5e-8f60-718293a4b5c6',
    options: { count: '8', types: ['mcq'], instructions: '' },
    submittedAt: 0,
  }

  it('round-trips the date, the client key, the options and the sent marker', () => {
    expect(writeDraft('s1', { ...draft, submittedAt: 123 })).toBeGreaterThan(0)
    expect(readDraft('s1')).toMatchObject({ ...draft, submittedAt: 123 })
  })
  it('removes an empty draft instead of saving it', () => {
    writeDraft('s1', draft)
    expect(writeDraft('s1', { ...draft, transcript: '  ' })).toBe(0)
    expect(readDraft('s1')).toBeNull()
  })
  it('ignores malformed keys and options from older versions', () => {
    window.localStorage.setItem('lessonDraft:s2', JSON.stringify({ transcript: 'Du texte assez long', clientKey: 'nope', options: 'x' }))
    expect(readDraft('s2')).toMatchObject({ clientKey: '', options: null, submittedAt: 0, lessonDate: '' })
  })
  it('keeps one draft per student (and one without student)', () => {
    writeDraft('', draft)
    writeDraft('s1', { ...draft, transcript: 'Autre texte pour un autre élève' })
    removeDraft('s1')
    expect(readDraft('')).not.toBeNull()
    expect(readDraft('s1')).toBeNull()
  })
})

describe('preferences', () => {
  it('stores strings and removes them with null', () => {
    writePref('lastStudent', 'abc')
    expect(readPref('lastStudent')).toBe('abc')
    expect(window.localStorage.getItem('teacher.lastStudent')).toBe('abc')
    writePref('lastStudent', null)
    expect(readPref('lastStudent')).toBeNull()
  })
})
