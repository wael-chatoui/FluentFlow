// Exercise sets for /dev/preview (dev only). Deterministic, unlike
// normalizeExercises (which shuffles MCQ choices), so a reload rebuilds the same
// exercises and the player can resume its saved run.
import { SAMPLE_LESSON } from '@/utils/lesson/sample'
import { normalizeExercisesForEdit } from '@/utils/lesson/schema'

// Rendering edge cases: **highlights** everywhere, other blank spellings, a
// question-style MCQ with English choices, long words, a 6-pair match.
const EDGE_CASES = [
  {
    type: 'mcq',
    prompt: 'Choose the **right** auxiliary',
    sentence: 'Hier, nous ____ rentrés très tard.',
    choices: ['sommes', 'avons', 'êtes'],
    answer: 0,
    explanation: '**Rentrer** uses **être** in the passé composé.',
  },
  {
    type: 'mcq',
    prompt: 'What does **la veille** mean?',
    sentence: 'Pick the right translation.',
    choices: ['the day before', 'the next day', 'the evening'],
    answer: 0,
    explanation: 'La veille = **the day before**.',
  },
  {
    type: 'fill_blank',
    prompt: 'Complete with **être** in the present',
    sentence: "Aujourd'hui, je [blank] très **content** de te voir.",
    answers: ['suis'],
    hint: 'être → **je** …',
    explanation: 'Je **suis**, tu es, il est.',
  },
  {
    type: 'match',
    prompt: 'Match the **long** words',
    pairs: [
      { fr: 'anticonstitutionnellement', en: 'unconstitutionally' },
      { fr: "l'arrière-grand-mère", en: 'the great-grandmother' },
      { fr: 'la veille', en: 'the day before' },
      { fr: 'rentrer', en: 'to go back home' },
      { fr: 'complet', en: 'sold out' },
      { fr: 'se promener', en: 'to go for a walk' },
    ],
    explanation: '',
  },
]

/** Rotates the choices of every other MCQ so the right answer isn't always first. */
function rotateChoices(exercise, i) {
  if (exercise.type !== 'mcq' || i % 2 === 0) return exercise
  const choices = [...exercise.choices.slice(1), exercise.choices[0]]
  return { ...exercise, choices, answer: (exercise.answer + choices.length - 1) % choices.length }
}

/**
 * @param {{ version: number, edgeCases: boolean, reviewMode: boolean }} options
 *   version: bumped by "lesson updated → Restart" (different exercises, like a regeneration)
 *   reviewMode: exercises carry lessonTitle, like /student/review
 */
export function devExercises({ version, edgeCases, reviewMode }) {
  const raw = [...SAMPLE_LESSON.exercises, ...(edgeCases ? EDGE_CASES : [])]
  const shifted = version % 2 ? [...raw.slice(1), raw[0]] : raw
  return normalizeExercisesForEdit(shifted)
    .map(rotateChoices)
    .map((e, i) => (reviewMode ? { ...e, lessonTitle: i % 2 ? 'Weekend plans' : 'At the bakery' } : e))
}

/** The practice API's result, computed locally (same runId → same stored result, like the server). */
export function devSaveResult(results, runId, { score, total }) {
  if (results.has(runId)) return { ...results.get(runId), duplicate: true }
  const best = [...results.values()].reduce((b, r) => (r.score / r.total > b.score / b.total ? r : b), { score, total })
  const result = { score, total, bestScore: best.score, bestTotal: best.total }
  results.set(runId, result)
  return result
}
