import { describe, expect, it } from 'vitest'
import {
  TRIAL_HOMEWORK_QUESTIONS,
  isStaleGeneration,
  normalizeExercises,
  normalizeExercisesForEdit,
  normalizeLessonContent,
  normalizePlanContent,
  safeHomeworkUrl,
} from '@/utils/lesson/schema'

const mcq = (extra = {}) => ({
  type: 'mcq',
  prompt: 'Choose',
  sentence: 'Je ___ allé au concert.',
  choices: ['suis', 'ai', 'es'],
  answer: 0,
  explanation: 'Aller uses **être**.',
  ...extra,
})
const fill = (extra = {}) => ({ type: 'fill_blank', prompt: 'Fill', sentence: 'Elle ___ partie.', answers: ['est'], hint: 'être', ...extra })
const match = (extra = {}) => ({
  type: 'match',
  prompt: 'Match',
  pairs: [
    { fr: 'partir', en: 'to leave' },
    { fr: 'rester', en: 'to stay' },
    { fr: 'tomber', en: 'to fall' },
  ],
  ...extra,
})

describe('exercise text', () => {
  it('strips ** from answers, choices and match pairs, keeps it elsewhere', () => {
    const [m, f, p] = normalizeExercises([
      mcq({ choices: ['**suis**', 'ai', 'es'], prompt: 'Pick the **auxiliary**' }),
      fill({ answers: ['**est**'], hint: 'use **être**' }),
      match({ pairs: [{ fr: '**partir**', en: 'to leave' }, { fr: 'rester', en: '**to stay**' }, { fr: 'tomber', en: 'to fall' }] }),
    ])
    expect(m.choices).toContain('suis')
    expect(m.choices.join(' ')).not.toContain('*')
    expect(m.prompt).toBe('Pick the **auxiliary**')
    expect(m.explanation).toBe('Aller uses **être**.')
    expect(f.answers).toEqual(['est'])
    expect(f.hint).toBe('use **être**')
    expect(p.pairs[0]).toEqual({ fr: 'partir', en: 'to leave' })
    expect(p.pairs[1]).toEqual({ fr: 'rester', en: 'to stay' })
  })

  it('rejects MCQ choices that become duplicates once ** is removed', () => {
    expect(normalizeExercises([mcq({ choices: ['**suis**', 'suis', 'es'] })])).toEqual([])
  })
})

describe('exercise types', () => {
  it('rejects prototype keys as types without throwing', () => {
    for (const type of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
      expect(normalizeExercises([{ type, evil: 'x' }])).toEqual([])
      expect(normalizeExercisesForEdit([{ type, evil: 'x' }])).toEqual([])
    }
  })

  it('ignores non-object items', () => {
    expect(normalizeExercises([null, 'mcq', 42, [mcq()]])).toEqual([])
  })
})

describe('mcq', () => {
  it('keeps the answer index on the right choice after the shuffle', () => {
    for (let i = 0; i < 50; i++) {
      const [e] = normalizeExercises([mcq({ choices: ['ai', 'suis', 'es'], answer: 1 })])
      expect(e.choices[e.answer]).toBe('suis')
      expect([...e.choices].sort()).toEqual(['ai', 'es', 'suis'])
    }
  })

  it('never shuffles when edited by a human', () => {
    const [e] = normalizeExercisesForEdit([mcq({ id: 'ex_3', choices: ['ai', 'suis', 'es'], answer: 1 })])
    expect(e).toMatchObject({ id: 'ex_3', choices: ['ai', 'suis', 'es'], answer: 1 })
  })

  it('normalizes the blank like fill_blank', () => {
    const [a, b] = normalizeExercises([mcq({ sentence: 'Je ____ allé.' }), mcq({ sentence: 'Je [blank] allé.' })])
    expect(a.sentence).toBe('Je ___ allé.')
    expect(b.sentence).toBe('Je ___ allé.')
  })

  it('accepts a sentence without a blank (the question itself)', () => {
    const [e] = normalizeExercises([mcq({ sentence: 'Which sentence is correct?' })])
    expect(e.sentence).toBe('Which sentence is correct?')
  })

  it('rejects a sentence with several blanks', () => {
    expect(normalizeExercises([mcq({ sentence: 'Je ___ allé ___ concert.' })])).toEqual([])
  })
})

describe('fill_blank', () => {
  it('needs exactly one blank', () => {
    expect(normalizeExercises([fill({ sentence: 'Elle est partie.' })])).toEqual([])
    expect(normalizeExercises([fill({ sentence: 'Elle ___ ___.' })])).toEqual([])
    expect(normalizeExercises([fill({ sentence: 'Elle [BLANK] partie.' })])[0].sentence).toBe('Elle ___ partie.')
  })
})

describe('normalizeExercisesForEdit', () => {
  it('keeps ids, numbers new exercises after the highest id', () => {
    const out = normalizeExercisesForEdit([mcq({ id: 'ex_2' }), fill(), match({ id: 'ex_2' })])
    expect(out.map((e) => e.id)).toEqual(['ex_2', 'ex_3', 'ex_4'])
  })

  it('never reuses an id that is still reserved (stored exercises)', () => {
    const out = normalizeExercisesForEdit([mcq({ id: 'ex_1' }), fill()], { reservedIds: ['ex_1', 'ex_2', 'ex_10'] })
    expect(out.map((e) => e.id)).toEqual(['ex_1', 'ex_11'])
  })
})

describe('homework links', () => {
  it('keeps only https YouTube searches and videos', () => {
    expect(safeHomeworkUrl('https://www.youtube.com/results?search_query=pass%C3%A9+compos%C3%A9')).toContain('search_query=')
    expect(safeHomeworkUrl('https://youtube.com/watch?v=dQw4w9WgXcQ')).toBe('https://youtube.com/watch?v=dQw4w9WgXcQ')
    expect(safeHomeworkUrl('https://youtu.be/dQw4w9WgXcQ')).toBe('https://youtu.be/dQw4w9WgXcQ')
    expect(safeHomeworkUrl('https://m.youtube.com/shorts/abcdef123')).toBe('https://m.youtube.com/shorts/abcdef123')
  })

  it('drops other sites, http and look-alike hosts', () => {
    for (const url of [
      'https://evil.example/results?search_query=x',
      'http://www.youtube.com/results?search_query=x',
      'https://www.youtube.com.evil.example/results?search_query=x',
      'https://www.youtube.com/results',
      'https://www.youtube.com/channel/abc',
      'https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ',
      'javascript:alert(1)',
      '',
    ]) {
      expect(safeHomeworkUrl(url)).toBe('')
    }
  })

  it('is applied to lesson homework', () => {
    const content = normalizeLessonContent({
      homework: [
        { task: 'Watch', link: 'https://www.youtube.com/results?search_query=avoir' },
        { task: 'Read', link: 'https://evil.example/page' },
      ],
    })
    expect(content.homework[0].link).toContain('youtube.com')
    expect(content.homework[1]).toEqual({ task: 'Read', link: '' })
  })
})

describe('isStaleGeneration', () => {
  const now = Date.parse('2026-09-29T12:00:00Z')
  it('is true only for a generating row untouched for more than 5 minutes', () => {
    expect(isStaleGeneration({ status: 'generating', updated_at: '2026-09-29T11:54:00Z' }, now)).toBe(true)
    expect(isStaleGeneration({ status: 'generating', updated_at: '2026-09-29T11:58:00Z' }, now)).toBe(false)
    expect(isStaleGeneration({ status: 'published', updated_at: '2026-09-29T10:00:00Z' }, now)).toBe(false)
    expect(isStaleGeneration({ status: 'generating', updated_at: null }, now)).toBe(false)
  })
})

describe('normalizePlanContent', () => {
  const raw = {
    title: 'Raconter un voyage',
    duration_min: 55,
    objectives: ['Maintenant je peux raconter un voyage.'],
    sections: [
      { heading: 'Warm-up', minutes: 5, body: 'Question :\n- Où es-tu allé ?' },
      { heading: '', minutes: 5, body: 'no heading' },
      { heading: 'Wrap-up', minutes: 'soon', body: 'Bilan' },
    ],
    homework_questions: ['injected'],
  }

  it('keeps valid sections and multi-line bodies', () => {
    const plan = normalizePlanContent(raw)
    expect(plan.sections).toEqual([
      { heading: 'Warm-up', minutes: 5, body: 'Question :\n- Où es-tu allé ?' },
      { heading: 'Wrap-up', minutes: null, body: 'Bilan' },
    ])
    expect(plan).toMatchObject({ title: 'Raconter un voyage', trial: false, duration_min: 55, homework_questions: [] })
  })

  it('always gives trial plans the 4 homework questions', () => {
    const plan = normalizePlanContent(raw, { trial: true })
    expect(plan.trial).toBe(true)
    expect(plan.homework_questions).toEqual([...TRIAL_HOMEWORK_QUESTIONS])
    expect(plan.homework_questions).toHaveLength(4)
  })

  it('falls back to defaults on garbage', () => {
    expect(normalizePlanContent(null)).toEqual({
      title: 'Prochain cours',
      trial: false,
      duration_min: 50,
      objectives: [],
      sections: [],
      homework_questions: [],
    })
  })
})
