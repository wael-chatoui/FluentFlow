// Shared helpers for back-office routes: pagination, query params, paged selects,
// ilike escaping and small diffs for the audit log.
import { fail } from '@/utils/api/errors'

export const DEFAULT_PER_PAGE = 50
export const MAX_PER_PAGE = 200
const ROW_PAGE = 1000 // PostgREST's default max rows per request
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

/** Every row of a query, page by page (bounded by MAX_ROWS). */
export async function selectAll(buildQuery) {
  const rows = []
  for (let from = 0; from < MAX_ROWS; from += ROW_PAGE) {
    const { data, error } = await buildQuery().range(from, from + ROW_PAGE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < ROW_PAGE) break
  }
  return rows
}

/** Exact row count of `table` (optionally filtered), without fetching rows. */
export async function countRows(admin, table, filter = (q) => q) {
  const { count, error } = await filter(admin.from(table).select('*', { count: 'exact', head: true }))
  if (error) throw error
  return count || 0
}

/** Escapes LIKE wildcards so `q` matches literally in a plain .ilike() filter. */
export function escapeLike(q) {
  return String(q).replace(/[\\%_]/g, (c) => `\\${c}`)
}

/**
 * `.or()` filter string matching `q` (case-insensitive substring) in any of `columns`.
 * The value is double-quoted, so `,` `(` `)` `.` `:` are literal; inside the quotes
 * PostgREST unescapes `\x` → `x`, hence the doubled backslashes before LIKE wildcards.
 * Column names must come from a trusted list (never from the request).
 */
export function ilikeAny(columns, q) {
  const inner = String(q)
    .replace(/\\/g, '\\\\\\\\') // \  → LIKE \\ (literal backslash)
    .replace(/[%_]/g, (c) => `\\\\${c}`) // % _ → LIKE \% \_ (literal)
    .replace(/"/g, '\\"')
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
