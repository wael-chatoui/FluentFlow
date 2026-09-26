// Input validation for API routes. Each helper returns the cleaned value,
// `undefined` when the field was not sent, or throws a BadRequest with `message`.
import { UUID_RE } from '@/utils/auth/server'
import { EXERCISE_TYPES, LEVELS, safeDriveUrl } from '@/utils/lesson/schema'
import { fail } from '@/utils/api/errors'
import { DEFAULT_GENERATION_OPTIONS, GENERATION_LIMITS } from '@/utils/ai/prompt'

export const LIMITS = {
  source: 150_000, // transcript / Canva notes
  title: 120,
  fullName: 120,
  profileText: 1000, // goals / interests
  notes: 10_000,
}

export const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value)

/** Request body as an object ({} when missing or not an object). */
export function bodyOf(req) {
  const body = req.body
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {}
}

/** Optional string: null → '', trimmed, at most `max` chars. */
export function optionalText(value, max, message) {
  if (value === undefined) return undefined
  if (value === null) return ''
  if (typeof value !== 'string' || value.length > max) fail(message)
  return value.trim()
}

export function optionalLevel(value, message) {
  if (value === undefined) return undefined
  if (!LEVELS.includes(value)) fail(message)
  return value
}

/** Real calendar date written YYYY-MM-DD. */
export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** '' or null clears the link (→ null); anything else must be an https Google Drive URL. */
export function optionalDriveUrl(value, message) {
  if (value === undefined) return undefined
  if (value === null || (typeof value === 'string' && !value.trim())) return null
  const url = typeof value === 'string' ? safeDriveUrl(value) : ''
  if (!url) fail(message)
  return url
}

/** At least `min` non-space characters. */
export function hasEnoughText(value, min = 20) {
  return typeof value === 'string' && value.replace(/\s/g, '').length >= min
}

// Lesson statuses a student may see. 'generating' only counts when the row
// already has content (a regeneration in progress keeps the previous version).
export const STUDENT_VISIBLE = ['published', 'generating']

/**
 * Profile fields sent by the student (onboarding / profile page), English messages.
 * Each field is `undefined` when not sent. `partial: false` (onboarding) also
 * requires fullName and level; otherwise fullName only has to be non-empty when sent.
 */
export function parseProfileInput(body, { partial = false } = {}) {
  const fullName = optionalText(body.fullName, LIMITS.fullName, `Your name must be at most ${LIMITS.fullName} characters.`)
  if (partial ? fullName === '' : !fullName) fail('Please enter your name.')
  const level = optionalLevel(body.level, 'Please choose your level.')
  if (!partial && !level) fail('Please choose your level.')
  const goals = optionalText(body.goals, LIMITS.profileText, `Goals must be at most ${LIMITS.profileText} characters.`)
  const interests = optionalText(body.interests, LIMITS.profileText, `Interests must be at most ${LIMITS.profileText} characters.`)
  return { fullName, level, goals, interests }
}

// Keeps only the answer shapes the grader understands (bounded for storage)
export function cleanAnswerValue(value) {
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (typeof value === 'string') return value.slice(0, 200)
  if (value && typeof value === 'object' && 'mistakes' in value) return { mistakes: Number(value.mistakes) }
  return null
}

/**
 * `body.answers` as [{ exerciseId, value }]: must be an array of at most `max`
 * items; entries without a string exerciseId are dropped, ids cut to `idLength`.
 */
export function parseAnswers(body, { max, idLength }) {
  const { answers } = body
  if (!Array.isArray(answers)) fail('answers must be an array.')
  if (answers.length > max) fail(`Too many answers (max ${max}).`)
  return answers
    .filter((a) => a && typeof a === 'object' && typeof a.exerciseId === 'string')
    .map((a) => ({ exerciseId: a.exerciseId.slice(0, idLength), value: cleanAnswerValue(a.value) }))
}

/**
 * Teacher's exercise generation options (French messages).
 * `{ count: int 4–20 (default 10), types: non-empty subset of EXERCISE_TYPES (default all),
 *    instructions: string ≤ 1000 (default '') }` — missing fields get their default.
 * @returns {{ count: number, types: string[], instructions: string } | undefined}
 *   undefined when `value` is undefined or null (not sent)
 */
export function parseGenerationOptions(value) {
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'object' || Array.isArray(value)) fail('Options de génération invalides.')
  const { minCount, maxCount, maxInstructions } = GENERATION_LIMITS

  let count = DEFAULT_GENERATION_OPTIONS.count
  if (value.count !== undefined && value.count !== null) {
    if (!Number.isInteger(value.count) || value.count < minCount || value.count > maxCount) {
      fail(`Le nombre d'exercices doit être un entier entre ${minCount} et ${maxCount}.`)
    }
    count = value.count
  }

  let types = [...DEFAULT_GENERATION_OPTIONS.types]
  if (value.types !== undefined && value.types !== null) {
    if (!Array.isArray(value.types) || value.types.length > 10) fail("Types d'exercices invalides.")
    if (value.types.some((t) => !EXERCISE_TYPES.includes(t))) {
      fail(`Type d'exercice inconnu (types possibles : ${EXERCISE_TYPES.join(', ')}).`)
    }
    // Deduplicated, in the canonical order
    types = EXERCISE_TYPES.filter((t) => value.types.includes(t))
    if (!types.length) fail("Choisis au moins un type d'exercice.")
  }

  const instructions =
    optionalText(value.instructions, maxInstructions, `Les consignes doivent faire au plus ${maxInstructions} caractères.`) || ''

  return { count, types, instructions }
}
