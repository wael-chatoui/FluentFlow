// Turns a class (transcript + Canva notes) into normalized lesson content + exercises.
import { AiError, aiConfig, chatJSON } from '@/utils/ai/client'
import { buildLessonPrompt } from '@/utils/ai/prompt'
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
function describeInvalid(rawExercises) {
  const raw = Array.isArray(rawExercises) ? rawExercises : []
  const problems = raw
    .map((e, i) => {
      if (normalizeExercises([e]).length) return null
      const rule = TYPE_RULES[e?.type] || 'type must be "mcq", "fill_blank" or "match"'
      return `- exercise ${i + 1} (${e?.type || 'no type'}): invalid — ${rule}`
    })
    .filter(Boolean)
  if (!raw.length) problems.push('- the "exercises" array was missing or empty')
  return problems.slice(0, 15).join('\n')
}

function toResult(raw) {
  return {
    content: normalizeLessonContent(raw),
    exercises: normalizeExercises(raw?.exercises),
  }
}

const isUsable = (r) => r.exercises.length >= MIN_EXERCISES && Boolean(r.content.summary)

function isDemoMode(config) {
  if (process.env.AI_DEMO === '1') return true
  return !config.apiKey && process.env.NODE_ENV !== 'production'
}

async function demoLesson() {
  await new Promise((resolve) => setTimeout(resolve, 1500))
  return { ...toResult(SAMPLE_LESSON), model: 'demo' }
}

/**
 * @param {{ profile?: object, notes?: string, transcript?: string, canva?: string,
 *           lessonDate?: string, previousLessons?: object[] }} input
 * @returns {Promise<{ content: object, exercises: object[], model: string }>}
 * @throws {AiError}
 */
export async function generateLesson(input) {
  const config = aiConfig()
  if (isDemoMode(config)) return demoLesson()
  if (!config.apiKey) {
    throw new AiError('IA non configurée : ajoute AI_API_KEY dans les variables d’environnement du serveur.')
  }

  const deadline = Date.now() + config.timeoutMs
  const { system, user } = buildLessonPrompt(input)

  const raw = await chatJSON({ system, user })
  let result = toResult(raw)

  const remaining = deadline - Date.now()
  if (!isUsable(result) && remaining > MIN_RETRY_BUDGET_MS) {
    const feedback = [
      `Your previous answer had only ${result.exercises.length} valid exercises${result.content.summary ? '' : ' and no summary'}.`,
      describeInvalid(raw?.exercises),
      'Return the COMPLETE JSON object again (recap + 10–14 valid exercises), following every rule.',
    ].join('\n')
    const retryRaw = await chatJSON({ system, user: `${user}\n\n${feedback}`, timeoutMs: remaining })
    const retry = toResult(retryRaw)
    if (isUsable(retry) || retry.exercises.length >= result.exercises.length) result = retry
  }

  if (result.exercises.length < MIN_EXERCISES) {
    throw new AiError("L'IA n'a pas produit assez d'exercices valides. Relance la génération.")
  }
  if (!result.content.summary) {
    throw new AiError("L'IA n'a pas produit de bilan. Relance la génération.")
  }

  return { ...result, model: config.model }
}
