// Editable form of one exercise for the teacher lesson page, validated with the
// same rules as the API (utils/lesson/schema.js normalizeExercisesForEdit), which
// would otherwise silently DROP an invalid exercise. Pure: tests/exerciseEdit.test.js.
import { BLANK } from '@/utils/lesson/schema'

export const EDIT_LIMITS = {
  prompt: 200,
  sentence: 400,
  choice: 160,
  answer: 80,
  answers: 5,
  hint: 160,
  explanation: 500,
  pair: 80,
  pairsMin: 3,
  pairsMax: 6,
}

const s = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v))
// The API collapses whitespace and trims every single-line field
const clean = (v) => s(v).replace(/\s+/g, ' ').trim()
// Choices, answers and pairs are stored without the ** highlight markers (schema.js plain())
const plain = (v) => clean(s(v).replace(/\*\*/g, ''))
const key = (v) => plain(v).toLowerCase()

/** Blanks once "____" / "[blank]" are normalized to ___ (like the API). */
export function countBlanks(sentence) {
  return s(sentence).replace(/\[blank\]|_{2,}/gi, BLANK).split(BLANK).length - 1
}

/** Stored exercise → editable draft (strings everywhere, answers one per line). */
export function toEditable(exercise) {
  const e = exercise || {}
  const base = { id: e.id, type: e.type, prompt: s(e.prompt), explanation: s(e.explanation) }
  if (e.type === 'mcq') {
    const choices = (Array.isArray(e.choices) ? e.choices : []).map(s).slice(0, 3)
    while (choices.length < 3) choices.push('')
    return { ...base, sentence: s(e.sentence), choices, answer: Number.isInteger(e.answer) ? e.answer : 0 }
  }
  if (e.type === 'fill_blank') {
    return {
      ...base,
      sentence: s(e.sentence),
      answersText: (Array.isArray(e.answers) ? e.answers : []).map(s).join('\n'),
      hint: s(e.hint),
    }
  }
  if (e.type === 'match') {
    return { ...base, pairs: (Array.isArray(e.pairs) ? e.pairs : []).map((p) => ({ fr: s(p?.fr), en: s(p?.en) })) }
  }
  return base
}

function answersOf(text) {
  return s(text)
    .split('\n')
    .map(plain)
    .filter(Boolean)
}

/** Draft → exercise object sent to the API (same id and type). */
export function fromEditable(draft) {
  const base = { id: draft.id, type: draft.type, prompt: clean(draft.prompt), explanation: clean(draft.explanation) }
  if (draft.type === 'mcq') {
    return { ...base, sentence: clean(draft.sentence), choices: draft.choices.map(plain), answer: draft.answer }
  }
  if (draft.type === 'fill_blank') {
    return { ...base, sentence: clean(draft.sentence), answers: answersOf(draft.answersText), hint: clean(draft.hint) }
  }
  if (draft.type === 'match') {
    return { ...base, pairs: draft.pairs.map((p) => ({ fr: plain(p.fr), en: plain(p.en) })) }
  }
  return base
}

/** French validation errors keyed by field ('sentence', 'choices', 'answers', 'pairs', …); {} when valid. */
export function exerciseErrors(draft) {
  const errors = {}
  const tooLong = (field, max) => {
    if (clean(draft[field]).length > max) errors[field] = `${max} caractères maximum.`
  }
  tooLong('prompt', EDIT_LIMITS.prompt)
  tooLong('explanation', EDIT_LIMITS.explanation)

  if (draft.type === 'mcq') {
    const n = countBlanks(draft.sentence)
    if (!clean(draft.sentence)) errors.sentence = 'La phrase est obligatoire.'
    else if (n > 1) errors.sentence = `La phrase peut contenir au plus un ${BLANK} (actuellement ${n}).`
    else tooLong('sentence', EDIT_LIMITS.sentence)
    const choices = draft.choices || []
    if (choices.length !== 3 || choices.some((c) => !plain(c))) errors.choices = 'Remplis les 3 choix.'
    else if (new Set(choices.map(key)).size !== 3) errors.choices = 'Les 3 choix doivent être différents.'
    else if (choices.some((c) => plain(c).length > EDIT_LIMITS.choice)) {
      errors.choices = `${EDIT_LIMITS.choice} caractères maximum par choix.`
    }
    if (!(draft.answer >= 0 && draft.answer <= 2)) errors.choices = 'Coche la bonne réponse.'
  } else if (draft.type === 'fill_blank') {
    const n = countBlanks(draft.sentence)
    if (!clean(draft.sentence)) errors.sentence = 'La phrase est obligatoire.'
    else if (n !== 1) errors.sentence = `La phrase doit contenir exactement un ${BLANK} (actuellement ${n}).`
    else tooLong('sentence', EDIT_LIMITS.sentence)
    const answers = answersOf(draft.answersText)
    if (answers.length === 0) errors.answers = 'Ajoute au moins une réponse acceptée.'
    else if (answers.length > EDIT_LIMITS.answers) errors.answers = `${EDIT_LIMITS.answers} réponses maximum.`
    else if (answers.some((a) => a.length > EDIT_LIMITS.answer)) {
      errors.answers = `${EDIT_LIMITS.answer} caractères maximum par réponse.`
    }
    tooLong('hint', EDIT_LIMITS.hint)
  } else if (draft.type === 'match') {
    const pairs = draft.pairs || []
    if (pairs.some((p) => !plain(p.fr) || !plain(p.en))) errors.pairs = 'Remplis le français et l’anglais de chaque paire.'
    else if (pairs.length < EDIT_LIMITS.pairsMin || pairs.length > EDIT_LIMITS.pairsMax) {
      errors.pairs = `Il faut entre ${EDIT_LIMITS.pairsMin} et ${EDIT_LIMITS.pairsMax} paires.`
    } else if (
      new Set(pairs.map((p) => key(p.fr))).size !== pairs.length ||
      new Set(pairs.map((p) => key(p.en))).size !== pairs.length
    ) {
      errors.pairs = 'Chaque mot doit être unique (côté français et côté anglais).'
    } else if (pairs.some((p) => plain(p.fr).length > EDIT_LIMITS.pair || plain(p.en).length > EDIT_LIMITS.pair)) {
      errors.pairs = `${EDIT_LIMITS.pair} caractères maximum par mot.`
    }
  } else {
    errors.type = "Type d'exercice inconnu."
  }
  return errors
}
