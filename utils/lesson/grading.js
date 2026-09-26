// Answer checking, shared by the practice UI (instant feedback) and the API
// (which re-grades submitted answers instead of trusting the client's score).
//
// Answer values by exercise type:
//   mcq        → index of the chosen choice (number)
//   fill_blank → the typed text (string)
//   match      → { mistakes: number } (pairs only lock when correct, so the
//                 client reports how many wrong pairings were tried first)

const APOSTROPHES = /[‘’ʼ`´]/g

/** Lowercase, unify apostrophes, collapse spaces, drop trailing punctuation. */
export function normalizeAnswer(value) {
  return String(value ?? '')
    .normalize('NFC')
    .toLowerCase()
    .replace(APOSTROPHES, "'")
    .replace(/\s+/g, ' ')
    .replace(/\s*'\s*/g, "'")
    .replace(/[.!?,;:]+$/g, '')
    .trim()
}

export function stripAccents(value) {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

/**
 * @returns {{ correct: boolean, accentWarning: boolean, expected: string }}
 *   accentWarning: accepted, but the accents were wrong/missing.
 *   expected: the right answer, for display.
 */
export function gradeAnswer(exercise, value) {
  switch (exercise?.type) {
    case 'mcq': {
      const expected = exercise.choices[exercise.answer]
      return { correct: Number.isInteger(value) && value === exercise.answer, accentWarning: false, expected }
    }
    case 'fill_blank': {
      const given = normalizeAnswer(value)
      const expected = exercise.answers[0]
      if (!given) return { correct: false, accentWarning: false, expected }
      const accepted = exercise.answers.map(normalizeAnswer)
      if (accepted.includes(given)) return { correct: true, accentWarning: false, expected }
      const loose = stripAccents(given)
      const looseMatch = accepted.some((a) => stripAccents(a) === loose)
      return { correct: looseMatch, accentWarning: looseMatch, expected }
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
