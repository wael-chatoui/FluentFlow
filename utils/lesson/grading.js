// Answer checking, shared by the practice UI (instant feedback) and the API
// (which re-grades submitted answers instead of trusting the client's score).
//
// Answer values by exercise type:
//   mcq        → index of the chosen choice (number)
//   fill_blank → the typed text (string)
//   match      → { mistakes: number } (pairs only lock when correct, so the
//                 client reports how many wrong pairings were tried first)
//
// Accent policy for fill_blank (French): an answer that differs from an accepted
// one only by its accents is accepted with a warning, EXCEPT when the accent
// changes the word — short words (≤ 3 letters: a/à, ou/où, la/là, du/dû…), known
// minimal pairs (sur/sûr, jeune/jeûne, tache/tâche…) and word endings (parle/parlé,
// allée/allee), where the accent carries the grammar. Those are graded wrong.

const APOSTROPHES = /[‘’ʼ`´]/g
const QUOTES = /["«»“”„]/g
const LIGATURES = [
  [/œ/g, 'oe'],
  [/æ/g, 'ae'],
]

// Words whose accent-less spelling is (or looks like) another French word
const MINIMAL_PAIRS = new Set([
  'a', 'ou', 'la', 'du', 'des', 'ca', 'sur', 'mur', 'cru', 'jeune', 'tache', 'mais', 'mat', 'foret',
  'notre', 'votre', 'cote', 'peche', 'pecher', 'eut', 'fut', 'boite', 'tete', 'roder', 'chasse',
])

/** Lowercase, unify apostrophes/quotes, drop **markup**, collapse spaces, drop trailing punctuation. */
export function normalizeAnswer(value) {
  return String(value ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(/\*\*/g, '')
    .replace(APOSTROPHES, "'")
    .replace(QUOTES, '')
    .replace(/…/g, '...')
    .replace(/\s+/g, ' ')
    .replace(/\s*'\s*/g, "'")
    .trim()
    .replace(/[.!?,;:]+$/g, '')
    .trim()
}

export function stripAccents(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').normalize('NFC')
}

// Equivalent typings that are never a mistake: œ/oe, æ/ae, hyphen vs space
function fold(value) {
  let v = value
  for (const [re, to] of LIGATURES) v = v.replace(re, to)
  return v.replace(/\s*-\s*/g, ' ')
}

const words = (value) => value.split(/[\s']+/).filter(Boolean)

/**
 * True when `given` and `expected` (normalized + folded) differ only by accents,
 * and every differing word is one where the accent does not change the meaning.
 */
function accentOnlyAndHarmless(given, expected) {
  if (stripAccents(given) !== stripAccents(expected)) return false
  const g = words(given)
  const e = words(expected)
  if (g.length !== e.length) return false
  for (let i = 0; i < e.length; i++) {
    if (g[i] === e[i]) continue
    const bare = stripAccents(e[i])
    if (bare.length <= 3 || MINIMAL_PAIRS.has(bare)) return false
    if (!harmlessAccentSlip(g[i], e[i])) return false
  }
  return true
}

// Accents in a word ending carry the grammar: a missing accent on the last letter
// (parlé / parle, été / ete) or on a past-participle ending -é(e)(s) (allée / allee)
// is a real mistake. Accent slips elsewhere in the word (élève / eleve) are not.
function harmlessAccentSlip(given, expected) {
  if (given.length !== expected.length) return false
  for (let i = 0; i < expected.length; i++) {
    if (given[i] === expected[i]) continue
    if (i === expected.length - 1) return false
    if (expected[i] === 'é' && /^e?s?$/.test(expected.slice(i + 1))) return false
  }
  return true
}

/**
 * @returns {{ correct: boolean, accentWarning: boolean, expected: string }}
 *   accentWarning: accepted, but the accents were wrong/missing.
 *   expected: the right answer to display (the accepted answer closest to what
 *   was typed, so the student sees the spelling they were aiming for).
 */
export function gradeAnswer(exercise, value) {
  switch (exercise?.type) {
    case 'mcq': {
      const choices = Array.isArray(exercise.choices) ? exercise.choices : []
      const expected = String(choices[exercise.answer] ?? '').replace(/\*\*/g, '')
      return { correct: Number.isInteger(value) && value === exercise.answer, accentWarning: false, expected }
    }
    case 'fill_blank': {
      const answers = Array.isArray(exercise.answers) ? exercise.answers : []
      const display = (a) => String(a ?? '').replace(/\*\*/g, '').trim()
      const given = fold(normalizeAnswer(value))
      const fallback = display(answers[0])
      if (!given) return { correct: false, accentWarning: false, expected: fallback }

      const accepted = answers.map((a) => ({ raw: display(a), key: fold(normalizeAnswer(a)) }))
      const exact = accepted.find((a) => a.key === given)
      if (exact) return { correct: true, accentWarning: false, expected: exact.raw }

      const loose = accepted.find((a) => accentOnlyAndHarmless(given, a.key))
      if (loose) return { correct: true, accentWarning: true, expected: loose.raw }

      // Wrong: show the accepted answer that only differs by accents, if any
      const near = accepted.find((a) => stripAccents(a.key) === stripAccents(given))
      return { correct: false, accentWarning: false, expected: (near || accepted[0] || { raw: fallback }).raw }
    }
    case 'match': {
      const mistakes = Number(value?.mistakes)
      return { correct: Number.isFinite(mistakes) && mistakes === 0, accentWarning: false, expected: '' }
    }
    default:
      return { correct: false, accentWarning: false, expected: '' }
  }
}

/** Grades a whole practice run. Only the first answer per exercise counts. */
export function scoreSession(exercises, answers) {
  const byId = new Map(exercises.map((e) => [e.id, e]))
  const seen = new Set()
  const graded = []
  for (const a of Array.isArray(answers) ? answers : []) {
    const ex = byId.get(a?.exerciseId)
    if (!ex || seen.has(ex.id)) continue
    seen.add(ex.id)
    graded.push({ exerciseId: ex.id, value: a.value, correct: gradeAnswer(ex, a.value).correct })
  }
  return { score: graded.filter((g) => g.correct).length, total: exercises.length, answers: graded }
}
