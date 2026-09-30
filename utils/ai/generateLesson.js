// Turns a class (transcript + Canva notes) or an imported lesson document into
// normalized lesson content + exercises.
import { AiError, NOT_CONFIGURED, aiConfig, chatSession, isDemoMode, timeoutMessage } from '@/utils/ai/client'
import { effectiveOptions } from '@/utils/ai/options'
import { buildLessonPrompt } from '@/utils/ai/prompt'
import { normalizeExercises, normalizeLessonContent } from '@/utils/lesson/schema'
import { SAMPLE_LESSON } from '@/utils/lesson/sample'

const MIN_EXERCISES = 4
// A few missing exercises are tolerated; more triggers the corrective retry
const COUNT_TOLERANCE = 2

const TYPE_RULES = {
  mcq: 'needs a sentence with at most one ___, exactly 3 different choices and "answer" = 0, 1 or 2',
  fill_blank: 'needs a sentence with exactly one ___ and a non-empty "answers" array',
  match: 'needs 3–6 pairs {fr, en}, all fr different and all en different',
}

const quoteTypes = (types) => types.map((t) => `"${t}"`).join(', ')

// Lists the exercises the normalizer rejected, so the retry can fix them
function describeInvalid(rawExercises, options) {
  const raw = Array.isArray(rawExercises) ? rawExercises : []
  const problems = raw
    .map((e, i) => {
      if (options && !options.types.includes(e?.type)) {
        return `- exercise ${i + 1} (${e?.type || 'no type'}): type not allowed — use only ${quoteTypes(options.types)}`
      }
      if (normalizeExercises([e]).length) return null
      const rule = TYPE_RULES[e?.type] || 'type must be "mcq", "fill_blank" or "match"'
      return `- exercise ${i + 1} (${e?.type || 'no type'}): invalid — ${rule}`
    })
    .filter(Boolean)
  if (!raw.length) problems.push('- the "exercises" array was missing or empty')
  return problems.slice(0, 15).join('\n')
}

// Keeps `count` exercises: the first of each type (so no requested type is lost when
// the model grouped them), then the others in the model's order.
function capExercises(exercises, count) {
  if (exercises.length <= count) return exercises
  const picked = new Set()
  for (const e of exercises) {
    if (picked.size < count && ![...picked].some((p) => p.type === e.type)) picked.add(e)
  }
  for (const e of exercises) {
    if (picked.size >= count) break
    picked.add(e)
  }
  return exercises.filter((e) => picked.has(e))
}

/**
 * Normalizes the AI answer. With options, exercises of other types are dropped and
 * the list is capped to count; ids are ex_1…ex_N in the final order.
 */
export function toResult(raw, options = null) {
  let rawExercises = Array.isArray(raw?.exercises) ? raw.exercises : []
  if (options) rawExercises = rawExercises.filter((e) => options.types.includes(e?.type))
  let exercises = normalizeExercises(rawExercises)
  if (options) exercises = capExercises(exercises, options.count)
  return {
    content: normalizeLessonContent(raw),
    exercises: exercises.map((e, i) => ({ ...e, id: `ex_${i + 1}` })),
  }
}

/** Fewest valid exercises accepted: 4, or `count` when the teacher asked for fewer. */
export const minExercises = (options) => (options ? Math.min(MIN_EXERCISES, options.count) : MIN_EXERCISES)

const isUsable = (r, options) => r.exercises.length >= minExercises(options) && Boolean(r.content.summary)

// Requested types that are missing from the result
const missingTypes = (r, options) => (options ? options.types.filter((t) => !r.exercises.some((e) => e.type === t)) : [])

// The default mix asks for 10–14 exercises
const DEFAULT_COUNT = 10

/** Usable, close enough to the requested count, and every requested type present. */
function isComplete(r, options) {
  if (!isUsable(r, options)) return false
  const wanted = options ? options.count : DEFAULT_COUNT
  return r.exercises.length >= wanted - COUNT_TOLERANCE && missingTypes(r, options).length === 0
}

// Ranks two results: complete > usable > more exercises
const score = (r, options) => (isComplete(r, options) ? 2000 : 0) + (isUsable(r, options) ? 1000 : 0) + r.exercises.length

function retryFeedback(raw, result, options) {
  const wanted = options
    ? `exactly ${options.count} valid exercises of type ${quoteTypes(options.types)}, each type used at least once`
    : '10–14 valid exercises'
  const missing = missingTypes(result, options)
  return [
    `IMPORTANT: your previous answer had only ${result.exercises.length} valid exercises${result.content.summary ? '' : ' and no summary'}.`,
    missing.length ? `- missing exercise types: ${quoteTypes(missing)}` : '',
    describeInvalid(raw?.exercises, options),
    `Return the COMPLETE JSON object again (recap + ${wanted}), following every rule.`,
  ]
    .filter(Boolean)
    .join('\n')
}

// Final checks shared by the AI and the demo output
function finalize(result, options) {
  if (result.exercises.length < minExercises(options)) {
    throw new AiError("L'IA n'a pas produit assez d'exercices valides. Relance la génération.", { code: 'unusable' })
  }
  if (!result.content.summary) {
    throw new AiError("L'IA n'a pas produit de bilan. Relance la génération.", { code: 'unusable' })
  }
  return result
}

async function demoLesson(options) {
  await new Promise((resolve) => setTimeout(resolve, 1500))
  return { ...finalize(toResult(SAMPLE_LESSON, options), options), model: 'demo', usage: null }
}

/**
 * @param {{ mode?: 'transcript'|'import', profile?: object, aiContext?: string,
 *           transcript?: string, canva?: string, sourceText?: string, sourceName?: string,
 *           lessonDate?: string, previousLessons?: object[],
 *           options?: { count: number, types: string[], instructions: string } | null }} input
 *   mode 'import' builds the lesson from `sourceText` (an existing lesson document)
 * @returns {Promise<{ content: object, exercises: object[], model: string,
 *                     usage: { prompt_tokens: number, completion_tokens: number, total_tokens: number, cost?: number } | null }>}
 *   usage = provider token usage summed over every call (null in demo mode); cost = USD
 *   reported by OpenRouter
 * @throws {AiError|Error}  with `usage` (tokens billed so far) and `model` attached
 */
export async function generateLesson(input) {
  const config = aiConfig()
  const mode = input?.mode === 'import' ? 'import' : 'transcript'
  const options = effectiveOptions(input?.mode, input?.options)
  if (isDemoMode(config)) return demoLesson(options)
  if (!config.apiKey) throw new AiError(NOT_CONFIGURED, { code: 'config' })

  const { system, user } = buildLessonPrompt({ ...input, options })
  const session = chatSession({ system, user, deadline: Date.now() + config.timeoutMs })

  try {
    const raw = await session.first()
    let result = toResult(raw, options)

    // Too few exercises, a missing type or no summary: one corrective retry
    if (!isComplete(result, options) && session.canRetry()) {
      try {
        const retry = toResult(await session.call(retryFeedback(raw, result, options)), options)
        if (score(retry, options) > score(result, options)) result = retry
      } catch (err) {
        // The first answer is still usable: keep it rather than fail
        if (!isUsable(result, options)) throw err
      }
    }

    return { ...finalize(result, options), model: config.model, usage: session.usage() }
  } catch (err) {
    // The timeout advice depends on what the teacher sent (transcript or document)
    const failure = err instanceof AiError && err.code === 'timeout' ? new AiError(timeoutMessage(mode), { code: 'timeout', cause: err }) : err
    failure.usage = session.usage()
    failure.model = config.model
    throw failure
  }
}
