import { describe, expect, it } from 'vitest'
import { computeMistakes } from '@/utils/api/mistakes'
import { lastPracticedByLesson, progressByLesson, progressOf } from '@/utils/api/progress'
import { collectVocabulary, foldFrench, isSameVersion, lessonWordCount, lessonsWithWords } from '@/utils/api/studentLessons'
import { computeUpNext } from '@/components/student/home/upNext'
import { FILTERS, filterById, progressStats, timeAgo } from '@/components/student/lessons/progress'

const V1 = '2026-09-01T10:00:00.123456+00:00'
const V2 = '2026-09-10T10:00:00.654321+00:00'

describe('progressByLesson', () => {
  const sessions = [
    { lesson_id: 'a', score: 10, total: 10, completed_at: '2026-09-05T10:00:00+00:00' }, // previous version
    { lesson_id: 'a', score: 6, total: 12, completed_at: '2026-09-11T10:00:00+00:00' },
    { lesson_id: 'a', score: 9, total: 12, completed_at: '2026-09-12T10:00:00+00:00' },
    { lesson_id: 'b', score: 1, total: 4, completed_at: '2026-09-12T10:00:00+00:00' },
  ]

  it('counts every session when no lessons are given (teacher/admin views)', () => {
    expect(progressOf(progressByLesson(sessions), 'a')).toEqual({ best_score: 10, best_total: 10, attempts: 3 })
  })

  it('only counts sessions at/after generated_at of the given lessons', () => {
    const map = progressByLesson(sessions, [{ id: 'a', generated_at: V2 }])
    expect(progressOf(map, 'a')).toEqual({ best_score: 9, best_total: 12, attempts: 2 })
    expect(progressOf(map, 'b')).toEqual({ best_score: null, best_total: null, attempts: 0 })
  })

  it('compares timestamps to the microsecond', () => {
    const at = '2026-09-10T10:00:00.654321+00:00'
    const before = '2026-09-10T10:00:00.654320+00:00'
    const lessons = [{ id: 'a', generated_at: V2 }]
    expect(progressByLesson([{ lesson_id: 'a', score: 1, total: 1, completed_at: at }], lessons).has('a')).toBe(true)
    expect(progressByLesson([{ lesson_id: 'a', score: 1, total: 1, completed_at: before }], lessons).has('a')).toBe(false)
  })

  it('keeps every session of a lesson without generated_at', () => {
    expect(progressOf(progressByLesson(sessions, [{ id: 'a', generated_at: null }]), 'a').attempts).toBe(3)
  })

  it('lastPracticedByLesson ignores versions (it answers "when")', () => {
    expect(lastPracticedByLesson(sessions).get('a')).toBe('2026-09-12T10:00:00+00:00')
  })
})

describe('computeMistakes', () => {
  const lesson = {
    id: 'l1',
    title: 'Lesson',
    lesson_date: '2026-09-10',
    generated_at: V2,
    exercises: [{ id: 'ex_1' }, { id: 'ex_2' }, { id: 'ex_3' }],
  }

  it('uses the latest current result per exercise, reviews winning ties', () => {
    const sessions = [
      {
        lesson_id: 'l1',
        completed_at: '2026-09-05T00:00:00+00:00', // graded the previous version: ignored
        answers: [{ exerciseId: 'ex_3', correct: false }],
      },
      {
        lesson_id: 'l1',
        completed_at: '2026-09-11T00:00:00+00:00',
        answers: [
          { exerciseId: 'ex_1', correct: false },
          { exerciseId: 'ex_2', correct: false },
        ],
      },
    ]
    const reviews = [{ lesson_id: 'l1', exercise_id: 'ex_2', correct: true, created_at: '2026-09-11T00:00:00+00:00' }]
    const mistakes = computeMistakes([lesson], sessions, reviews)
    expect(mistakes.map((m) => m.exercise.id)).toEqual(['ex_1'])
  })

  it('ignores lessons that are not visible (not passed in)', () => {
    const sessions = [{ lesson_id: 'hidden', completed_at: V2, answers: [{ exerciseId: 'ex_1', correct: false }] }]
    expect(computeMistakes([lesson], sessions, [])).toEqual([])
  })
})

describe('isSameVersion', () => {
  it('matches the same timestamp whatever its formatting', () => {
    expect(isSameVersion(V1, { generated_at: V1 })).toBe(true)
    expect(isSameVersion('2026-09-01T10:00:00.123456Z', { generated_at: V1 })).toBe(true)
  })
  it('rejects another version, a missing version and junk', () => {
    expect(isSameVersion(V1, { generated_at: V2 })).toBe(false)
    expect(isSameVersion(undefined, { generated_at: V2 })).toBe(false)
    expect(isSameVersion('', { generated_at: V2 })).toBe(false)
    expect(isSameVersion('nope', { generated_at: V2 })).toBe(false)
  })
  it("accepts '' for lessons without generated_at", () => {
    expect(isSameVersion('', { generated_at: null })).toBe(true)
    expect(isSameVersion(V1, { generated_at: null })).toBe(false)
  })
})

describe('word bank', () => {
  it('folds case, accents, apostrophes, punctuation and ligatures', () => {
    expect(foldFrench('C’est  !')).toBe("c'est")
    expect(foldFrench("c ' est")).toBe("c'est")
    expect(foldFrench('Bonjour !')).toBe('bonjour')
    expect(foldFrench('Peut-être')).toBe('peut etre')
    expect(foldFrench('Œuf')).toBe('oeuf')
    expect(foldFrench('**très** bien…')).toBe('tres bien')
  })

  const lessons = [
    {
      id: 'new',
      title: 'Newest',
      lesson_date: '2026-09-20',
      vocabulary: [
        { fr: 'c’est', en: 'it is (new)' },
        { fr: 'Bonjour !', en: 'hello' },
        { fr: '   ', en: 'blank' },
        { fr: 'pain', en: 42 },
      ],
      expressions: [{ fr: 'Ça marche', en: 'OK', example: 'Ça marche, à demain.' }],
    },
    {
      id: 'old',
      title: 'Older',
      lesson_date: '2026-09-01',
      vocabulary: [
        { fr: "c'est", en: 'it is (old)' },
        { fr: 'bonjour', en: 'hi' },
        { fr: 'le pain', en: 'bread' },
      ],
      expressions: [{ fr: 'ça marche.', en: 'fine' }],
    },
  ]

  it('keeps one item per folded French form, newest lesson first', () => {
    const items = collectVocabulary(lessons)
    expect(items.map((i) => [i.fr, i.lessonId, i.kind])).toEqual([
      ['c’est', 'new', 'word'],
      ['Bonjour !', 'new', 'word'],
      ['Ça marche', 'new', 'expression'],
      ['le pain', 'old', 'word'],
    ])
    expect(items[0].en).toBe('it is (new)')
    expect(items[2].example).toBe('Ça marche, à demain.')
  })

  it('lists every lesson a word appears in (complete per-lesson decks)', () => {
    const items = collectVocabulary(lessons)
    expect(items.find((i) => i.fr === 'c’est').lessonIds).toEqual(['new', 'old'])
    expect(items.find((i) => i.fr === 'le pain').lessonIds).toEqual(['old'])
    expect(lessonsWithWords([...lessons, { id: 'empty', title: 'No words', vocabulary: [] }]).map((l) => l.id)).toEqual([
      'new',
      'old',
    ])
  })

  it('counts distinct words per lesson with the same rule', () => {
    expect(lessonWordCount(lessons[0])).toBe(3)
    expect(lessonWordCount({ vocabulary: [{ fr: 'Oui', en: 'yes' }, { fr: 'oui !', en: 'yes' }] })).toBe(1)
    expect(lessonWordCount({})).toBe(0)
  })
})

describe('student lists', () => {
  const lesson = (id, date, extra) => ({ id, lesson_date: date, exercise_count: 5, best_score: null, best_total: null, ...extra })

  it('Up next flags a lesson the teacher updated since the last practice', () => {
    const updated = lesson('u', '2026-09-20', { updated_since_practice: true })
    expect(computeUpNext([updated], 0)).toMatchObject({ kind: 'new', updated: true })
    expect(computeUpNext([lesson('n', '2026-09-20')], 0)).toMatchObject({ kind: 'new', updated: false })
  })

  it('an updated lesson is "to practice" again', () => {
    const updated = lesson('u', '2026-09-20', { updated_since_practice: true })
    expect(filterById('todo').test(updated)).toBe(true)
    expect(FILTERS.find((f) => f.id === 'mastered').test(updated)).toBe(false)
  })

  it('progressStats uses the deduplicated word count from the API', () => {
    const stats = progressStats([lesson('a', '2026-09-20', { best_score: 5, best_total: 10 })], 17)
    expect(stats).toEqual({ lessons: 1, mastery: 50, words: 17 })
  })

  it('timeAgo counts calendar days', () => {
    const now = new Date(2026, 8, 30, 9, 0)
    expect(timeAgo(new Date(2026, 8, 30, 1, 0).toISOString(), now)).toBe('today')
    expect(timeAgo(new Date(2026, 8, 29, 23, 30).toISOString(), now)).toBe('yesterday')
    expect(timeAgo(new Date(2026, 8, 27, 12, 0).toISOString(), now)).toBe('3 days ago')
    expect(timeAgo(new Date(2026, 8, 16, 12, 0).toISOString(), now)).toBe('2 weeks ago')
    expect(timeAgo(new Date(2026, 5, 30, 12, 0).toISOString(), now)).toBe('3 months ago')
    expect(timeAgo(new Date(2024, 8, 30, 12, 0).toISOString(), now)).toBe('over a year ago')
    expect(timeAgo('not a date', now)).toBe('')
  })
})
