import { EXERCISE_TYPES } from '@/utils/lesson/schema'

// Fisher–Yates (Math.random): call it from state initializers of client-rendered components
export { shuffle } from '@/utils/lesson/schema'

export function cx(...names) {
  return names.filter(Boolean).join(' ')
}

// The blank as stored (___), plus the spellings the AI or a human editor may use
const BLANK_RE = /_{2,}|\[blank\]/i
const BLANKS_RE = /_{2,}|\[blank\]/gi

/** Splits a sentence around its (first) blank → [before, after], or null if there is no blank. */
export function splitBlank(sentence) {
  const s = typeof sentence === 'string' ? sentence : ''
  const m = BLANK_RE.exec(s)
  if (!m) return null
  return [s.slice(0, m.index), s.slice(m.index + m[0].length)]
}

/** Lesson text without its **highlight** markers (for speech, aria-labels, plain strings). */
export function plainText(text) {
  return typeof text === 'string' ? text.replace(/\*\*/g, '').trim() : ''
}

/** A sentence as it should be read aloud: the blank becomes `fill`, or a pause ("…"). */
export function speakable(sentence, fill = '') {
  return plainText(sentence).replace(BLANKS_RE, plainText(fill) || '…')
}

// Frequent words that only exist in one of the two languages (ambiguous ones like
// "a", "on", "son" are left out). Enough to tell a French sentence from an English one.
const FRENCH_WORDS = new Set(
  'le la les un une des du au aux je tu il elle ils elles nous vous est sont suis es et en que qui ce ça cette pas ne mon ma mes ton ta tes sa ses avec pour dans très leur être avoir fait était'.split(' ')
)
const ENGLISH_WORDS = new Set(
  'the an is are was were be to of and in it what which who how does do did you your my this that pick choose sentence correct mean means with for word right answer'.split(' ')
)

/**
 * Best guess of whether a short text is French. Exercise text mixes both languages
 * (an MCQ can ask "What does it mean?" with English choices), so `lang` and the
 * listen buttons are decided per field.
 */
export function isLikelyFrench(text) {
  const words = plainText(text).toLowerCase().split(/[^a-zà-ÿœæ]+/).filter(Boolean)
  let score = 0
  for (const w of words) {
    if (FRENCH_WORDS.has(w) || /[àâçéèêëîïôûùüœæ]/.test(w)) score += 1
    else if (ENGLISH_WORDS.has(w)) score -= 1
  }
  return score > 0
}

/** Keeps only exercises the player can render (the server already normalized them). */
export function playableExercises(exercises) {
  if (!Array.isArray(exercises)) return []
  return exercises.filter((e) => {
    if (!e || typeof e.id !== 'string' || !EXERCISE_TYPES.includes(e.type) || e.disabled) return false
    if (e.type === 'mcq') return Array.isArray(e.choices) && e.choices.length > 0 && Number.isInteger(e.answer)
    if (e.type === 'fill_blank') return Array.isArray(e.answers) && e.answers.length > 0 && typeof e.sentence === 'string'
    return Array.isArray(e.pairs) && e.pairs.length > 1
  })
}

/** Every accepted answer, for display ("est arrivée / arrivée"). */
export function correctAnswerText(exercise) {
  if (exercise.type === 'mcq') return plainText(exercise.choices[exercise.answer])
  if (exercise.type === 'fill_blank') return exercise.answers.map(plainText).filter(Boolean).join(' / ')
  if (exercise.type === 'match') return exercise.pairs.map((p) => `${plainText(p.fr)} = ${plainText(p.en)}`).join(' · ')
  return ''
}

/** What the student answered, for display. */
export function givenText(exercise, value) {
  if (exercise.type === 'mcq') return Number.isInteger(value) ? plainText(exercise.choices[value]) : ''
  if (exercise.type === 'fill_blank') return typeof value === 'string' ? value.trim() : ''
  if (exercise.type === 'match') {
    const n = Number(value?.mistakes) || 0
    return `${n} wrong ${n === 1 ? 'pair' : 'pairs'} before matching everything`
  }
  return ''
}
