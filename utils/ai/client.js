// Minimal client for any OpenAI-compatible `chat/completions` endpoint
// (default: Qwen via OpenRouter; Alibaba Model Studio, DeepSeek, OpenAI… work the same).
// Server-side only.
//
// Errors are thrown as AiError with a short French message meant for the teacher
// (it is stored in lessons.error), never containing secrets, and a `code` the
// callers use to decide on a retry.

export class AiError extends Error {
  /**
   * @param {string} message  French, shown to the teacher
   * @param {{ code?: string, cause?: unknown, usage?: object }} [details]
   *   usage = tokens billed before the failure (e.g. an unparsable completion)
   */
  constructor(message, { code = 'error', cause, usage } = {}) {
    super(message)
    this.name = 'AiError'
    this.code = code
    if (cause) this.cause = cause
    if (usage) this.usage = usage
  }
}

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1'
const DEFAULT_MODEL = 'qwen/qwen3.7-flash'
const DEFAULT_TIMEOUT_MS = 240_000
// The AI routes have maxDuration = 300 s: a longer AI_TIMEOUT_MS would get the function
// killed before it can store the result or the failure (row stuck in 'generating').
const MAX_TIMEOUT_MS = 270_000
const DEFAULT_MAX_TOKENS = 8192
const RETRY_DELAY_MS = 2000

const positive = (value, fallback) => (Number(value) > 0 ? Math.round(Number(value)) : fallback)

/** True for an OpenRouter endpoint, which can report the real cost of each call (usage.cost, USD). */
export function isOpenRouter(baseUrl) {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase()
    return host === 'openrouter.ai' || host.endsWith('.openrouter.ai')
  } catch {
    return false
  }
}

export function aiConfig() {
  const baseUrl = (process.env.AI_BASE_URL || DEFAULT_BASE_URL).trim().replace(/\/+$/, '')
  return {
    baseUrl,
    apiKey: (process.env.AI_API_KEY || '').trim(),
    model: (process.env.AI_MODEL || DEFAULT_MODEL).trim(),
    timeoutMs: Math.min(positive(process.env.AI_TIMEOUT_MS, DEFAULT_TIMEOUT_MS), MAX_TIMEOUT_MS),
    maxTokens: positive(process.env.AI_MAX_TOKENS, DEFAULT_MAX_TOKENS),
    openRouter: isOpenRouter(baseUrl),
  }
}

/**
 * Demo mode (canned output, no AI call): outside production only, without an API key
 * or with AI_DEMO=1. AI_DEMO is ignored in production so sample content can never
 * reach real students.
 */
export function isDemoMode(config = aiConfig()) {
  if (process.env.NODE_ENV === 'production') return false
  return process.env.AI_DEMO === '1' || !config.apiKey
}

export const NOT_CONFIGURED = 'IA non configurée : ajoute AI_API_KEY dans les variables d’environnement du serveur.'

// Mode-neutral (lessons from a transcript or a document, tutor plans): generateLesson
// adds a hint that fits its source to the timeout message (timeoutMessage).
const MESSAGES = {
  timeout: "L'IA a mis trop de temps à répondre. Réessaie dans un instant.",
  network: "Impossible de joindre le service d'IA. Vérifie la connexion et AI_BASE_URL.",
  auth: "Clé API de l'IA refusée : vérifie AI_API_KEY (et AI_BASE_URL, qui doit correspondre au fournisseur de la clé).",
  credit: "Crédit épuisé chez le fournisseur d'IA : recharge ton compte.",
  quota: "Le fournisseur d'IA limite les requêtes (quota atteint). Réessaie dans quelques minutes.",
  unavailable: "Le service d'IA est momentanément indisponible. Réessaie dans quelques minutes.",
  notFound: "Modèle ou adresse de l'IA introuvable : vérifie AI_MODEL et AI_BASE_URL.",
  rejected: "Le fournisseur d'IA a refusé la requête. Vérifie AI_MODEL.",
  filtered: "Le fournisseur d'IA a bloqué la réponse (filtre de contenu). Relance la génération.",
  invalidJson: "L'IA a renvoyé une réponse illisible. Relance la génération.",
  truncated: "La réponse de l'IA a été coupée (trop longue). Relance la génération.",
}

function codeForStatus(status) {
  if (status === 401 || status === 403) return 'auth'
  if (status === 402) return 'credit'
  if (status === 429) return 'quota'
  if (status === 404) return 'notFound'
  if (status >= 500) return 'unavailable'
  return 'rejected'
}

const aiError = (code, details = {}) => new AiError(MESSAGES[code], { code, ...details })

const TIMEOUT_HINTS = {
  transcript: 'raccourcis la transcription ou les notes Canva',
  import: 'découpe le document en parties plus courtes',
}

/** Timeout message with advice that fits the lesson source ('transcript' | 'import'); neutral otherwise. */
export function timeoutMessage(mode) {
  const hint = TIMEOUT_HINTS[mode]
  return hint ? `${MESSAGES.timeout.replace(/\.$/, '')} ; si ça se reproduit, ${hint}.` : MESSAGES.timeout
}
const isRetryableStatus = (status) => status === 429 || status >= 500

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const TRAILING_COMMA_END = /\s*[}\]]/y

// Outside strings: drops trailing commas. Inside strings: escapes raw control
// characters (models often put real line breaks in long texts).
function repairJson(s) {
  let out = ''
  let inString = false
  let escaped = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      else if (ch === '\n') {
        out += '\\n'
        continue
      } else if (ch === '\r') continue
      else if (ch === '\t') {
        out += '\\t'
        continue
      }
      out += ch
      continue
    }
    if (ch === '"') inString = true
    else if (ch === ',') {
      TRAILING_COMMA_END.lastIndex = i + 1
      if (TRAILING_COMMA_END.test(s)) continue
    }
    out += ch
  }
  return out
}

// Every balanced top-level {...} of `s` (braces inside strings are ignored)
function balancedObjects(s) {
  const found = []
  let depth = 0
  let start = -1
  let inString = false
  let escaped = false
  for (let i = 0; i < s.length; i++) {
    const ch = s[i]
    if (inString) {
      if (escaped) escaped = false
      else if (ch === '\\') escaped = true
      else if (ch === '"') inString = false
      continue
    }
    if (ch === '"' && depth > 0) inString = true
    else if (ch === '{') {
      if (depth === 0) start = i
      depth++
    } else if (ch === '}' && depth > 0) {
      depth--
      if (depth === 0) found.push(s.slice(start, i + 1))
    }
  }
  return found
}

function tryParseObject(candidate) {
  for (const text of [candidate, repairJson(candidate)]) {
    try {
      const value = JSON.parse(text)
      if (value && typeof value === 'object' && !Array.isArray(value)) return value
    } catch {
      // next attempt
    }
  }
  return null
}

/**
 * Extracts a JSON object from model output: plain JSON, ```json fences, <think>
 * blocks or surrounding prose. Tries the whole text, then each balanced {...}
 * (largest first), each also after a light repair (trailing commas, raw newlines).
 */
export function parseJsonObject(text) {
  if (typeof text !== 'string') return null
  const s = text
    .replace(/<think>[\s\S]*?(<\/think>|$)/gi, '')
    .replace(/```(?:json)?/gi, '')
    .trim()
  if (!s) return null
  const whole = tryParseObject(s)
  if (whole) return whole
  const candidates = balancedObjects(s).sort((a, b) => b.length - a.length)
  for (const candidate of candidates) {
    const value = tryParseObject(candidate)
    if (value) return value
  }
  return null
}

function messageText(content) {
  if (typeof content === 'string') return content
  // Some providers return an array of content parts
  if (Array.isArray(content)) return content.map((part) => part?.text ?? '').join('')
  return ''
}

const EMPTY_USAGE = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 }

const tokens = (value) => (Number.isFinite(Number(value)) && Number(value) > 0 ? Math.round(Number(value)) : 0)

/** A reported cost in USD (number ≥ 0), or null when missing or invalid. */
export function costOf(value) {
  if (typeof value !== 'number' && !(typeof value === 'string' && value.trim())) return null
  const n = Number(value)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/**
 * Adds provider usage objects ({ prompt_tokens, completion_tokens, total_tokens, cost? }).
 * Missing/invalid token counts count as 0. `cost` (USD, reported by OpenRouter) is the
 * sum of the reported costs, and is left out when no usage reported one, so "unknown"
 * never reads as "free". Returns a fresh object.
 */
export function addUsage(...usages) {
  const sum = { ...EMPTY_USAGE }
  let cost = null
  for (const u of usages) {
    if (!u || typeof u !== 'object') continue
    const prompt = tokens(u.prompt_tokens)
    const completion = tokens(u.completion_tokens)
    sum.prompt_tokens += prompt
    sum.completion_tokens += completion
    sum.total_tokens += tokens(u.total_tokens) || prompt + completion
    const reported = costOf(u.cost)
    if (reported !== null) cost = (cost ?? 0) + reported
  }
  // Rounded to 1e-10 USD: float noise only, far below any real price
  if (cost !== null) sum.cost = Math.round(cost * 1e10) / 1e10
  return sum
}

/**
 * Feedback appended to the user message when retrying after an unparsable or cut-off
 * answer, or null when `err` is not that kind of failure.
 */
export function jsonRetryFeedback(err) {
  if (!(err instanceof AiError)) return null
  if (err.code === 'truncated') {
    return 'IMPORTANT: your previous answer was cut off because it was too long. Reply again with ONE complete, valid JSON object and nothing else. Be more concise (shorter texts), but keep every required field.'
  }
  if (err.code === 'invalidJson') {
    return 'IMPORTANT: your previous answer was not valid JSON. Reply again with ONE complete, valid JSON object and nothing else: no markdown fences, no comments, no text before or after, no trailing commas, line breaks inside strings written as \\n.'
  }
  return null
}

/**
 * Sends one chat completion and returns the JSON object the model answered with,
 * plus the provider's token usage for it. Network errors, 429/5xx responses and
 * provider errors returned with HTTP 200 are retried once.
 * @param {{ system: string, user: string, timeoutMs?: number }} params
 * @returns {Promise<{ data: object, usage: { prompt_tokens: number, completion_tokens: number, total_tokens: number, cost?: number } }>}
 *   usage.cost = USD reported by OpenRouter (absent with other providers)
 * @throws {AiError}  `usage` is set when a completion was billed but could not be used
 */
export async function chatJSONWithUsage({ system, user, timeoutMs }) {
  const config = aiConfig()
  if (!config.apiKey) throw new AiError(NOT_CONFIGURED, { code: 'config' })

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs || config.timeoutMs)
  let useResponseFormat = true
  let retried = false
  let usage = addUsage()

  const canRetry = () => !retried && !controller.signal.aborted
  const retry = async (delay) => {
    retried = true
    await sleep(delay)
  }

  try {
    while (true) {
      const body = {
        model: config.model,
        temperature: 0.4,
        max_tokens: config.maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        ...(useResponseFormat ? { response_format: { type: 'json_object' } } : {}),
        // OpenRouter usage accounting: usage.cost = what the call really cost (USD)
        ...(config.openRouter ? { usage: { include: true } } : {}),
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
        if (controller.signal.aborted) throw aiError('timeout', { cause: err, usage })
        if (canRetry()) {
          await retry(RETRY_DELAY_MS)
          continue
        }
        throw aiError('network', { cause: err, usage })
      }

      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        // Providers without JSON mode: retry once without response_format
        if (res.status === 400 && useResponseFormat && /response_format|json_object/i.test(detail)) {
          useResponseFormat = false
          continue
        }
        if (isRetryableStatus(res.status) && canRetry()) {
          await retry(RETRY_DELAY_MS * 2)
          continue
        }
        console.error(`[ai] provider error ${res.status}:`, detail.slice(0, 500))
        throw aiError(codeForStatus(res.status), { usage })
      }

      let payload
      try {
        payload = await res.json()
      } catch (err) {
        if (controller.signal.aborted) throw aiError('timeout', { cause: err, usage })
        throw aiError('invalidJson', { cause: err, usage })
      }
      usage = addUsage(usage, payload?.usage)

      // Some gateways (OpenRouter) report upstream failures as HTTP 200 + { error }
      const choice = payload?.choices?.[0]
      if (payload?.error || !choice) {
        const status = Number(payload?.error?.code) || 502
        if (isRetryableStatus(status) && canRetry()) {
          await retry(RETRY_DELAY_MS * 2)
          continue
        }
        console.error('[ai] provider error in a 200 response:', JSON.stringify(payload?.error || payload).slice(0, 500))
        throw aiError(codeForStatus(status), { usage })
      }

      const content = messageText(choice.message?.content)
      const parsed = parseJsonObject(content)
      if (parsed) return { data: parsed, usage }

      const finish = choice.finish_reason
      if (finish === 'length') throw aiError('truncated', { usage })
      if (finish === 'content_filter') throw aiError('filtered', { usage })
      if (finish === 'error' && !content.trim() && canRetry()) {
        await retry(RETRY_DELAY_MS * 2)
        continue
      }
      if (finish === 'error') throw aiError('unavailable', { usage })
      throw aiError('invalidJson', { usage })
    }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Chat calls sharing one time budget and one usage total: a first call and the
 * corrective retries of the same prompt.
 * @param {{ system: string, user: string, deadline: number, minRetryMs?: number }} params
 *   deadline = Date.now()-based time by which every call must be done
 */
export function chatSession({ system, user, deadline, minRetryMs = 30_000 }) {
  let usage = addUsage()
  const session = {
    /** Tokens billed so far, over every call (failed ones included). */
    usage: () => usage,
    /** Enough budget left for one more call. */
    canRetry: () => deadline - Date.now() > minRetryMs,
    /** One call; `extra` (feedback) is appended to the user message. */
    async call(extra) {
      try {
        const timeoutMs = Math.max(1, deadline - Date.now())
        const answer = await chatJSONWithUsage({ system, user: extra ? `${user}\n\n${extra}` : user, timeoutMs })
        usage = addUsage(usage, answer.usage)
        return answer.data
      } catch (err) {
        usage = addUsage(usage, err?.usage)
        throw err
      }
    },
    /** First call, asked again once for valid JSON when the answer was unparsable or cut off. */
    async first() {
      try {
        return await session.call()
      } catch (err) {
        const feedback = jsonRetryFeedback(err)
        if (!feedback || !session.canRetry()) throw err
        return session.call(feedback)
      }
    },
  }
  return session
}
