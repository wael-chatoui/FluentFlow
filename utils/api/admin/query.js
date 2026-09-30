// Shared helpers for back-office routes: pagination, query params, paged selects,
// ilike filters and small diffs for the audit log.
import { fail } from '@/utils/api/errors'
import { isMissingTable } from '@/utils/ai/ledger'

export const DEFAULT_PER_PAGE = 50
export const MAX_PER_PAGE = 200
const ROW_PAGE = 1000 // rows asked per request (PostgREST may return fewer: its max-rows setting)
const MAX_ROWS = 100_000

function toInt(value) {
  const n = Number.parseInt(Array.isArray(value) ? value[0] : value, 10)
  return Number.isFinite(n) ? n : null
}

/**
 * `page` (1-based, ≥ 1) and `perPage` (default 50, 1–200) from the query string.
 * @returns {{ page: number, perPage: number, from: number, to: number }}  from/to for .range()
 */
export function parsePagination(query = {}) {
  const page = Math.max(1, Math.min(toInt(query.page) ?? 1, 1_000_000))
  const perPage = Math.max(1, Math.min(toInt(query.perPage) ?? DEFAULT_PER_PAGE, MAX_PER_PAGE))
  const from = (page - 1) * perPage
  return { page, perPage, from, to: from + perPage - 1 }
}

/** Last page (≥ 1) for `total` rows. */
export const lastPage = (total, perPage) => Math.max(1, Math.ceil((Number(total) || 0) / perPage))

/** A single string query param, trimmed and cut to `max` chars ('' when missing). */
export function queryText(value, max = 200) {
  const v = Array.isArray(value) ? value[0] : value
  return typeof v === 'string' ? v.trim().slice(0, max) : ''
}

/** `value` if it is one of `allowed`, `fallback` when empty, else 400 with `message`. */
export function queryEnum(value, allowed, fallback, message) {
  const v = queryText(value, 50)
  if (!v) return fallback
  if (!allowed.includes(v)) fail(message)
  return v
}

/**
 * Every row of a query, page by page. Stops on an empty page rather than on a short
 * one, so a project whose PostgREST max-rows is below ROW_PAGE is never truncated.
 * @param {() => object} buildQuery  fresh query with a deterministic order
 */
export async function selectAll(buildQuery) {
  const rows = []
  while (rows.length < MAX_ROWS) {
    const { data, error } = await buildQuery().range(rows.length, rows.length + ROW_PAGE - 1)
    if (error) throw error
    if (!data?.length) return rows
    rows.push(...data)
  }
  console.warn(`[admin] selectAll stopped at ${MAX_ROWS} rows: totals may be incomplete`)
  return rows
}

/**
 * One page of rows with the exact total. A page past the end (bookmarked URL, rows
 * deleted meanwhile) makes PostgREST answer 416 (PGRST103): the last page is returned
 * instead, with its number, so the client can follow.
 * @param {(options: { count: 'exact', head?: boolean }) => object} build
 *   returns admin.from(t).select(columns, options) with its filters and order
 * @returns {Promise<{ rows: object[], total: number, page: number }>}
 */
export async function selectPage(build, { page, perPage }) {
  const fetchPage = (p) => build({ count: 'exact' }).range((p - 1) * perPage, p * perPage - 1)
  const first = await fetchPage(page)
  if (!first.error) return { rows: first.data || [], total: first.count || 0, page }
  if (first.error.code !== 'PGRST103') throw first.error

  const { count, error } = await build({ count: 'exact', head: true })
  if (error) throw error
  if (!count) return { rows: [], total: 0, page: 1 }
  const last = lastPage(count, perPage)
  const retry = await fetchPage(last)
  if (retry.error) throw retry.error
  return { rows: retry.data || [], total: retry.count || 0, page: last }
}

/**
 * Why an optional table (migration 0006: lesson_plans, ai_generations) cannot be read:
 * 'missing' (migration not applied) or 'forbidden' (not granted to service_role: new
 * Supabase tables are no longer exposed to the API roles by default); null otherwise.
 */
export function unavailableTable(error) {
  if (isMissingTable(error)) return 'missing'
  if (error?.code === '42501') return 'forbidden'
  return null
}

/** Exact row count of `table` (optionally filtered), without fetching rows. */
export async function countRows(admin, table, filter = (q) => q) {
  const { count, error } = await filter(admin.from(table).select('*', { count: 'exact', head: true }))
  if (error) throw error
  return count || 0
}

/**
 * `.or()` filter matching `q` (case-insensitive substring) in any of `columns`.
 * The value is double-quoted, so , ( ) . : are literal; inside the quotes PostgREST
 * unescapes \x → x, hence the doubled backslashes before LIKE wildcards (% _ \).
 * PostgREST turns every * of a like pattern into %, and * cannot be escaped: it
 * becomes _ (exactly one character), the closest to a literal match.
 * Column names must come from a trusted list (never from the request).
 */
export function ilikeAny(columns, q) {
  const inner = String(q)
    .replace(/\\/g, '\\\\\\\\') // \  → LIKE \\ (literal backslash)
    .replace(/[%_]/g, (c) => `\\\\${c}`) // % _ → LIKE \% \_ (literal)
    .replace(/"/g, '\\"')
    .replace(/\*/g, '_')
  return columns.map((c) => `${c}.ilike."%${inner}%"`).join(',')
}

/**
 * Compact diff for the audit log: { field: { from, to } } for changed fields.
 * Fields listed in `summaryOnly` are recorded as { changed: true, length } (long text).
 */
export function diffFields(before, after, { summaryOnly = [] } = {}) {
  const changes = {}
  for (const key of Object.keys(after)) {
    const from = before?.[key] ?? null
    const to = after[key] ?? null
    if (JSON.stringify(from) === JSON.stringify(to)) continue
    changes[key] = summaryOnly.includes(key)
      ? { changed: true, length: typeof to === 'string' ? to.length : 0 }
      : { from, to }
  }
  return changes
}
