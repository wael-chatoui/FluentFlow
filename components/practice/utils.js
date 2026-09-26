import { BLANK } from '@/utils/lesson/schema'

export const EXERCISE_TYPES = ['mcq', 'fill_blank', 'match']

export function cx(...names) {
  return names.filter(Boolean).join(' ')
}

/** Fisher–Yates. Client-only (Math.random): call from state initializers of client-rendered components. */
export function shuffle(items) {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** Splits a sentence around the ___ blank → [before, after] or null if there is no blank. */
export function splitBlank(sentence) {
  const s = typeof sentence === 'string' ? sentence : ''
  const i = s.indexOf(BLANK)
  if (i === -1) return null
  return [s.slice(0, i), s.slice(i + BLANK.length)]
}

/** Keeps only exercises the player can render (the server already normalized them). */
export function playableExercises(exercises) {
  if (!Array.isArray(exercises)) return []
  return exercises.filter((e) => {
    if (!e || typeof e.id !== 'string' || !EXERCISE_TYPES.includes(e.type)) return false
    if (e.type === 'mcq') return Array.isArray(e.choices) && e.choices.length > 0 && Number.isInteger(e.answer)
    if (e.type === 'fill_blank') return Array.isArray(e.answers) && e.answers.length > 0 && typeof e.sentence === 'string'
    return Array.isArray(e.pairs) && e.pairs.length > 1
  })
}

/** Right answer, for display. */
export function expectedText(exercise) {
  if (exercise.type === 'mcq') return exercise.choices[exercise.answer] ?? ''
  if (exercise.type === 'fill_blank') return exercise.answers[0] ?? ''
  return ''
}

/** What the student answered, for display. */
export function givenText(exercise, value) {
  if (exercise.type === 'mcq') return Number.isInteger(value) ? exercise.choices[value] ?? '' : ''
  if (exercise.type === 'fill_blank') return typeof value === 'string' ? value.trim() : ''
  if (exercise.type === 'match') {
    const n = Number(value?.mistakes) || 0
    return `${n} wrong ${n === 1 ? 'pair' : 'pairs'} before matching everything`
  }
  return ''
}
