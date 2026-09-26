// Minimal client for any OpenAI-compatible `chat/completions` endpoint
// (Qwen via Alibaba Model Studio, DeepSeek, OpenAI…). Server-side only.
//
// Errors are thrown as AiError with a short French message meant for the
// teacher (it is stored in lessons.error), never containing secrets.

export class AiError extends Error {
  constructor(message, cause) {
    super(message)
    this.name = 'AiError'
    if (cause) this.cause = cause
  }
}

const DEFAULT_BASE_URL = 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1'
const DEFAULT_MODEL = 'qwen-flash'
const DEFAULT_TIMEOUT_MS = 240_000
const RETRY_DELAY_MS = 2000

export function aiConfig() {
  return {
    baseUrl: (process.env.AI_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, ''),
    apiKey: (process.env.AI_API_KEY || '').trim(),
    model: (process.env.AI_MODEL || DEFAULT_MODEL).trim(),
    timeoutMs: Number(process.env.AI_TIMEOUT_MS) > 0 ? Number(process.env.AI_TIMEOUT_MS) : DEFAULT_TIMEOUT_MS,
  }
}

const MESSAGES = {
  timeout: "L'IA a mis trop de temps à répondre. Réessaie, ou raccourcis la transcription.",
  network: "Impossible de joindre le service d'IA. Vérifie la connexion et AI_BASE_URL.",
  auth: "Clé API de l'IA refusée : vérifie AI_API_KEY.",
  credit: "Crédit épuisé chez le fournisseur d'IA : recharge ton compte.",
  quota: "Le fournisseur d'IA limite les requêtes (quota atteint). Réessaie dans quelques minutes.",
  unavailable: "Le service d'IA est momentanément indisponible. Réessaie dans quelques minutes.",
  notFound: "Modèle ou adresse de l'IA introuvable : vérifie AI_MODEL et AI_BASE_URL.",
  rejected: "Le fournisseur d'IA a refusé la requête. Vérifie AI_MODEL.",
  invalidJson: "L'IA a renvoyé une réponse illisible. Relance la génération.",
  truncated: "La réponse de l'IA a été coupée (trop longue). Relance la génération.",
}

function errorForStatus(status) {
  if (status === 401 || status === 403) return MESSAGES.auth
  if (status === 402) return MESSAGES.credit
  if (status === 429) return MESSAGES.quota
  if (status === 404) return MESSAGES.notFound
  if (status >= 500) return MESSAGES.unavailable
  return MESSAGES.rejected
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Extracts a JSON object from model output: plain JSON, ```json fences, or surrounding prose. */
export function parseJsonObject(text) {
  if (typeof text !== 'string') return null
  const s = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  const candidates = [s]
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start >= 0 && end > start) candidates.push(s.slice(start, end + 1))
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(candidate)
      if (value && typeof value === 'object' && !Array.isArray(value)) return value
    } catch {
      // try the next candidate
    }
  }
  return null
}

function messageText(content) {
  if (typeof content === 'string') return content
  // Some providers return an array of content parts
  if (Array.isArray(content)) return content.map((part) => part?.text ?? '').join('')
  return ''
}

/**
 * Sends one chat completion and returns the parsed JSON object the model answered with.
 * @param {{ system: string, user: string, maxTokens?: number, timeoutMs?: number }} params
 * @returns {Promise<object>}
 * @throws {AiError}
 */
export async function chatJSON({ system, user, maxTokens = 8192, timeoutMs }) {
  const config = aiConfig()
  if (!config.apiKey) throw new AiError('IA non configurée : ajoute AI_API_KEY dans les variables d’environnement.')

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs || config.timeoutMs)
  let useResponseFormat = true
  let retried = false

  const canRetry = () => !retried && !controller.signal.aborted

  try {
    while (true) {
      const body = {
        model: config.model,
        temperature: 0.4,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        ...(useResponseFormat ? { response_format: { type: 'json_object' } } : {}),
      }

      let res
      try {
        res = await fetch(`${config.baseUrl}/chat/completions`, {
          method: 'POST',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
          body: JSON.stringify(body),
        })
      } catch (err) {
        if (controller.signal.aborted) throw new AiError(MESSAGES.timeout, err)
        if (canRetry()) {
          retried = true
          await sleep(RETRY_DELAY_MS)
          continue
        }
        throw new AiError(MESSAGES.network, err)
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        // Providers without JSON mode: retry once without response_format
        if (res.status === 400 && useResponseFormat && /response_format|json_object/i.test(detail)) {
          useResponseFormat = false
          continue
        }
        if ((res.status === 429 || res.status >= 500) && canRetry()) {
          retried = true
          await sleep(RETRY_DELAY_MS * 2)
          continue
        }
        console.error(`[ai] provider error ${res.status}:`, detail.slice(0, 500))
        throw new AiError(errorForStatus(res.status))
      }

      let payload
      try {
        payload = await res.json()
      } catch (err) {
        if (controller.signal.aborted) throw new AiError(MESSAGES.timeout, err)
        throw new AiError(MESSAGES.invalidJson, err)
      }

      const choice = payload?.choices?.[0]
      const parsed = parseJsonObject(messageText(choice?.message?.content))
      if (parsed) return parsed
      throw new AiError(choice?.finish_reason === 'length' ? MESSAGES.truncated : MESSAGES.invalidJson)
    }
  } finally {
    clearTimeout(timer)
  }
}
