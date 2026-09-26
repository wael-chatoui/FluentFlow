// Pure helpers for GET /api/admin/stats: 30-day series (UTC days), success rate, AI cost.

const DAYS = 30
const DEFAULT_PRICE_INPUT = 0.05 // USD per 1M prompt tokens (qwen-flash)
const DEFAULT_PRICE_OUTPUT = 0.4 // USD per 1M completion tokens

function price(value, fallback) {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/** ['YYYY-MM-DD' ×days] ending today (UTC), oldest first. */
export function lastDays(days = DAYS, now = new Date()) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  return Array.from({ length: days }, (_, i) => new Date(today - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10))
}

/** Counts per day of `days`, from ISO timestamps (other days ignored). */
export function dailyCounts(days, timestamps) {
  const index = new Map(days.map((d, i) => [d, i]))
  const counts = days.map(() => 0)
  for (const t of timestamps) {
    const ms = Date.parse(t || '')
    if (!Number.isFinite(ms)) continue
    const i = index.get(new Date(ms).toISOString().slice(0, 10))
    if (i !== undefined) counts[i] += 1
  }
  return counts
}

/** Mean of score/total ×100, rounded; null without sessions. */
export function successRate(sessions) {
  const valid = sessions.filter((s) => Number(s.total) > 0)
  if (!valid.length) return null
  const sum = valid.reduce((acc, s) => acc + Math.min(1, Math.max(0, Number(s.score) / Number(s.total))), 0)
  return Math.round((sum / valid.length) * 100)
}

export function aiSummary(usages, env = process.env) {
  const priceIn = price(env.AI_PRICE_INPUT_PER_M, DEFAULT_PRICE_INPUT)
  const priceOut = price(env.AI_PRICE_OUTPUT_PER_M, DEFAULT_PRICE_OUTPUT)
  let calls = 0
  let prompt = 0
  let completion = 0
  for (const u of usages) {
    if (!u || typeof u !== 'object') continue
    calls += 1
    prompt += Number(u.prompt_tokens) > 0 ? Number(u.prompt_tokens) : 0
    completion += Number(u.completion_tokens) > 0 ? Number(u.completion_tokens) : 0
  }
  const cost = (prompt / 1e6) * priceIn + (completion / 1e6) * priceOut
  return {
    calls,
    prompt_tokens: prompt,
    completion_tokens: completion,
    estimated_cost_usd: Math.round(cost * 10_000) / 10_000,
    price_input_per_m: priceIn,
    price_output_per_m: priceOut,
  }
}
