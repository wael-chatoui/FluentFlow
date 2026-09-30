// Turns a class (transcript + Canva notes) or an imported lesson document into
// normalized lesson content + exercises.
import { AiError, addUsage, aiConfig, chatJSONWithUsage } from '@/utils/ai/client'
import { DEFAULT_GENERATION_OPTIONS, buildLessonPrompt, resolveGenerationOptions } from '@/utils/ai/prompt'
import { normalizeExercises, normalizeLessonContent } from '@/utils/lesson/schema'
import { SAMPLE_LESSON } from '@/utils/lesson/sample'

const MIN_EXERCISES = 4
const MIN_RETRY_BUDGET_MS = 30_000

const TYPE_RULES = {
  mcq: 'needs a sentence, exactly 3 different choices and "answer" = 0, 1 or 2',
  fill_blank: 'needs a sentence with exactly one ___ and a non-empty "answers" array',
  match: 'needs 3–6 pairs {fr, en}, all fr different and all en different',
}

// Lists the exercises the normalizer rejected, so the retry can fix them
function describeInvalid(rawExercises, options) {
  const raw = Array.isArray(rawExercises) ? rawExercises : []
  const problems = raw
    .map((e, i) => {
      if (options && !options.types.includes(e?.type)) {
        return `- exercise ${i + 1} (${e?.type || 'no type'}): type not allowed — use only ${options.types.map((t) => `"${t}"`).join(', ')}`
      }
      if (normalizeExercises([e]).length) return null
      const rule = TYPE_RULES[e?.type] || 'type must be "mcq", "fill_blank" or "match"'
      return `- exercise ${i + 1} (${e?.type || 'no type'}): invalid — ${rule}`
    })
    .filter(Boolean)
  if (!raw.length) problems.push('- the "exercises" array was missing or empty')
  return problems.slice(0, 15).join('\n')
}

/**
 * Normalizes the AI answer. With options, exercises of other types are dropped
 * (before ids are assigned, so ids stay ex_1…ex_N) and the list is capped to count.
 */
export function toResult(raw, options = null) {
  let rawExercises = Array.isArray(raw?.exercises) ? raw.exercises : []
  if (options) rawExercises = rawExercises.filter((e) => options.types.includes(e?.type))
  let exercises = normalizeExercises(rawExercises)
  if (options) exercises = exercises.slice(0, options.count)
  return { content: normalizeLessonContent(raw), exercises }
}

/** Fewest valid exercises accepted: 4, or `count` when the teacher asked for fewer. */
export const minExercises = (options) => (options ? Math.min(MIN_EXERCISES, options.count) : MIN_EXERCISES)

const isUsable = (r, options) => r.exercises.length >= minExercises(options) && Boolean(r.content.summary)

function isDemoMode(config) {
  if (process.env.AI_DEMO === '1') return true
  return !config.apiKey && process.env.NODE_ENV !== 'production'
}

async function demoLesson(options) {
  await new Promise((resolve) => setTimeout(resolve, 1500))
  return { ...toResult(SAMPLE_LESSON, options), model: 'demo', usage: null }
}

/** Options actually used: import mode always has some (defaults), transcript mode only when given. */
export function effectiveOptions(mode, options) {
  return resolveGenerationOptions(options) || (mode === 'import' ? resolveGenerationOptions(DEFAULT_GENERATION_OPTIONS) : null)
}

/**
 * @param {{ mode?: 'transcript'|'import', profile?: object, notes?: string,
 *           transcript?: string, canva?: string, sourceText?: string, sourceName?: string,
 *           lessonDate?: string, previousLessons?: object[],
 *           options?: { count: number, types: string[], instructions: string } | null }} input
 *   mode 'import' builds the lesson from `sourceText` (an existing lesson document)
 * @returns {Promise<{ content: object, exercises: object[], model: string,
 *                     usage: { prompt_tokens: number, completion_tokens: number, total_tokens: number } | null }>}
 *   usage = provider token usage summed over every call (null in demo mode)
 * @throws {AiError}
 */
export async function generateLesson(input) {
  const config = aiConfig()
  const options = effectiveOptions(input?.mode, input?.options)
  if (isDemoMode(config)) return demoLesson(options)
  if (!config.apiKey) {
    throw new AiError('IA non configurée : ajoute AI_API_KEY dans les variables d’environnement du serveur.')
  }

  const deadline = Date.now() + config.timeoutMs
  const { system, user } = buildLessonPrompt({ ...input, options })

  const first = await chatJSONWithUsage({ system, user })
  const raw = first.data
  let usage = first.usage
  let result = toResult(raw, options)

  const remaining = deadline - Date.now()
  if (!isUsable(result, options) && remaining > MIN_RETRY_BUDGET_MS) {
    const wanted = options
      ? `exactly ${options.count} valid exercises of type ${options.types.map((t) => `"${t}"`).join(', ')}`
      : '10–14 valid exercises'
    const feedback = [
      `Your previous answer had only ${result.exercises.length} valid exercises${result.content.summary ? '' : ' and no summary'}.`,
      describeInvalid(raw?.exercises, options),
      `Return the COMPLETE JSON object again (recap + ${wanted}), following every rule.`,
    ].join('\n')
    const second = await chatJSONWithUsage({ system, user: `${user}\n\n${feedback}`, timeoutMs: remaining })
    usage = addUsage(usage, second.usage)
    const retry = toResult(second.data, options)
    if (isUsable(retry, options) || retry.exercises.length >= result.exercises.length) result = retry
  }

  if (result.exercises.length < minExercises(options)) {
    throw new AiError("L'IA n'a pas produit assez d'exercices valides. Relance la génération.")
  }
  if (!result.content.summary) {
    throw new AiError("L'IA n'a pas produit de bilan. Relance la génération.")
  }

  return { ...result, model: config.model, usage }
}
