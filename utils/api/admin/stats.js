// Pure helpers for GET /api/admin/stats: 30-day series (UTC days), success rate, AI spend.
import { costOf } from '@/utils/ai/client'

const DAYS = 30
const DEFAULT_PRICE_INPUT = 0.05 // USD per 1M prompt tokens (qwen-flash)
const DEFAULT_PRICE_OUTPUT = 0.4 // USD per 1M completion tokens

function price(value, fallback) {
  const n = Number.parseFloat(value)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

const tokens = (n) => (Number(n) > 0 ? Number(n) : 0)

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

// Rounded to 1e-6 USD: enough for per-call amounts, no float noise
const usd = (n) => Math.round(n * 1_000_000) / 1_000_000

/**
 * Spend of `items` ({ prompt, completion, cost }): the cost reported by the provider
 * (OpenRouter) where there is one, the token × price estimate for the others.
 * cost_usd = that best total; cost_source = 'provider' (every priced call reported its
 * cost), 'estimate' (none did) or 'mixed'. estimated_cost_usd = token × price over every
 * call, for comparison.
 */
function spend(items, env) {
  const priceIn = price(env.AI_PRICE_INPUT_PER_M, DEFAULT_PRICE_INPUT)
  const priceOut = price(env.AI_PRICE_OUTPUT_PER_M, DEFAULT_PRICE_OUTPUT)
  const estimate = (p, c) => (p / 1e6) * priceIn + (c / 1e6) * priceOut
  let prompt = 0
  let completion = 0
  let reported = 0
  let reportedCalls = 0
  let estimated = 0
  let estimatedCalls = 0
  for (const item of items) {
    prompt += item.prompt
    completion += item.completion
    if (item.cost !== null) {
      reported += item.cost
      reportedCalls += 1
    } else if (item.prompt || item.completion) {
      // Calls without tokens (demo, failure before any billing) cost nothing either way
      estimated += estimate(item.prompt, item.completion)
      estimatedCalls += 1
    }
  }
  return {
    prompt_tokens: prompt,
    completion_tokens: completion,
    cost_usd: usd(reported + estimated),
    cost_source: !reportedCalls ? 'estimate' : estimatedCalls ? 'mixed' : 'provider',
    provider_cost_usd: reportedCalls ? usd(reported) : null,
    provider_cost_calls: reportedCalls,
    estimated_calls: estimatedCalls,
    estimated_cost_usd: Math.round(estimate(prompt, completion) * 10_000) / 10_000,
    price_input_per_m: priceIn,
    price_output_per_m: priceOut,
  }
}

const spendItem = (prompt, completion, cost) => ({ prompt: tokens(prompt), completion: tokens(completion), cost: costOf(cost) })

/**
 * AI spend from the ai_generations ledger (migration 0006): one row per generation
 * attempt (lessons and tutor plans), failures included, so this is the real spend.
 * @param {{ kind: string, ok: boolean, prompt_tokens: number|null, completion_tokens: number|null,
 *           duration_ms: number|null, cost_usd?: number|string|null, created_at?: string }[]} rows
 *   cost_usd = real cost reported by OpenRouter (missing column or null → estimated from the tokens)
 * @param {object} env
 * @param {{ since?: string }} options
 */
export function aiLedgerSummary(rows, env = process.env, options = {}) {
  let failures = 0
  let durationSum = 0
  let durationCount = 0
  const byKind = {}
  const rows30d = options.since ? rows.filter((r) => r.created_at && r.created_at >= options.since) : []
  for (const r of rows) {
    if (!r.ok) failures += 1
    if (Number(r.duration_ms) > 0) {
      durationSum += Number(r.duration_ms)
      durationCount += 1
    }
    const kind = r.kind || 'lesson'
    byKind[kind] = (byKind[kind] || 0) + 1
  }

  const fullSpend = spend(rows.map((r) => spendItem(r.prompt_tokens, r.completion_tokens, r.cost_usd)), env)
  const spend30d = options.since
    ? spend(rows30d.map((r) => spendItem(r.prompt_tokens, r.completion_tokens, r.cost_usd)), env)
    : null

  const lessonRows = rows.filter((r) => (r.kind || 'lesson') === 'lesson')
  const lessonSpend = spend(lessonRows.map((r) => spendItem(r.prompt_tokens, r.completion_tokens, r.cost_usd)), env)
  const avgCostPerLesson = lessonRows.length > 0 ? usd(lessonSpend.cost_usd / lessonRows.length) : null

  return {
    source: 'ledger',
    calls: rows.length,
    calls_30d: options.since ? rows30d.length : null,
    failures,
    failure_rate: rows.length ? Math.round((failures / rows.length) * 100) : null,
    avg_duration_ms: durationCount ? Math.round(durationSum / durationCount) : null,
    by_kind: byKind,
    cost_30d_usd: spend30d ? spend30d.cost_usd : null,
    avg_cost_per_lesson_usd: avgCostPerLesson,
    ...fullSpend,
  }
}

/**
 * Fallback before migration 0006: usage stored on the current version of each lesson
 * (lessons.ai_usage, with `cost` when OpenRouter reported it). A lower bound:
 * regenerations overwrite it, failures and deleted lessons are missing, and there is
 * no failure or latency data.
 */
export function aiUsageSummary(usages, env = process.env) {
  const items = usages.filter((u) => u && typeof u === 'object').map((u) => spendItem(u.prompt_tokens, u.completion_tokens, u.cost))
  const fullSpend = spend(items, env)
  const avgCost = items.length > 0 ? usd(fullSpend.cost_usd / items.length) : null
  return {
    source: 'lessons',
    calls: items.length,
    calls_30d: null,
    failures: null,
    failure_rate: null,
    avg_duration_ms: null,
    by_kind: { lesson: items.length },
    cost_30d_usd: null,
    avg_cost_per_lesson_usd: avgCost,
    ...fullSpend,
  }
}

/**
 * Recurring revenue & margin summary from subscriptions (Stripe / Mollie) and AI spend.
 * @param {Array<{ status: string, amount_cents?: number, plan?: string, provider?: string, user_id?: string }>} subscriptions
 * @param {number} aiCostUsd
 * @param {number} studentsCount
 */
export function financeSummary(subscriptions = [], aiCostUsd = 0, studentsCount = 0) {
  const activeSubs = (subscriptions || []).filter((s) => s && (s.status === 'active' || s.status === 'trialing'))
  const uniqueSubscribers = new Set(activeSubs.map((s) => s.user_id).filter(Boolean)).size

  let mrrCents = 0
  const byProvider = {}
  for (const s of activeSubs) {
    const provider = s.provider || 'stripe'
    byProvider[provider] = (byProvider[provider] || 0) + 1

    const amount = Number(s.amount_cents) || 0
    if (s.plan === 'yearly') {
      mrrCents += amount / 12
    } else {
      mrrCents += amount
    }
  }

  const mrrEur = Math.round(mrrCents) / 100
  // Approximate USD to EUR conversion at 0.92 for gross margin estimation
  const aiCostEur = Math.round((Number(aiCostUsd) || 0) * 0.92 * 100) / 100
  const grossMarginEur = Math.round((mrrEur - aiCostEur) * 100) / 100
  const subscribersRate = studentsCount > 0 ? Math.round((uniqueSubscribers / studentsCount) * 100) : 0
  const arpuEur = uniqueSubscribers > 0 ? Math.round((mrrEur / uniqueSubscribers) * 100) / 100 : 0

  return {
    mrr_eur: mrrEur,
    active_subscribers: uniqueSubscribers,
    subscribers_rate: subscribersRate,
    gross_margin_eur: grossMarginEur,
    ai_cost_eur: aiCostEur,
    arpu_eur: arpuEur,
    providers: byProvider,
  }
}
