// Generation options and source-length limits, shared by the API validation, the
// prompt builder and the teacher UI. No server-only imports: safe in the browser.
import { EXERCISE_TYPES } from '@/utils/lesson/schema'

/** Longest texts sent to the AI (characters). Longer input is rejected by the API. */
export const MAX_TRANSCRIPT = 120_000
export const MAX_CANVA = 40_000
export const MAX_DOCUMENT = 150_000
/** Shortest imported document text (characters, after trim). */
export const MIN_DOCUMENT = 200

/** Bounds of the teacher's generation options { count, types, instructions }. */
export const GENERATION_LIMITS = Object.freeze({ minCount: 4, maxCount: 20, defaultCount: 10, maxInstructions: 1000 })

export const DEFAULT_GENERATION_OPTIONS = Object.freeze({
  count: GENERATION_LIMITS.defaultCount,
  types: Object.freeze([...EXERCISE_TYPES]),
  instructions: '',
})

/**
 * Lenient normalization of generation options (already validated, or read from the
 * database): clamps count, keeps known types (all when none), trims instructions.
 * @returns {{ count: number, types: string[], instructions: string } | null} null when `raw` is not an object
 */
export function resolveGenerationOptions(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const { minCount, maxCount, defaultCount, maxInstructions } = GENERATION_LIMITS
  const n = Number(raw.count)
  const count = Number.isInteger(n) ? Math.min(maxCount, Math.max(minCount, n)) : defaultCount
  const wanted = Array.isArray(raw.types) ? raw.types : []
  const types = EXERCISE_TYPES.filter((t) => wanted.includes(t))
  const instructions = typeof raw.instructions === 'string' ? raw.instructions.trim().slice(0, maxInstructions) : ''
  return { count, types: types.length ? types : [...EXERCISE_TYPES], instructions }
}

/** Options actually used: import mode always has some (defaults), transcript mode only when given. */
export function effectiveOptions(mode, options) {
  return resolveGenerationOptions(options) || (mode === 'import' ? resolveGenerationOptions(DEFAULT_GENERATION_OPTIONS) : null)
}
