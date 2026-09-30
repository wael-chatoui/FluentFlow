// Read-only table explorer registry (back office). Only the tables and columns
// listed here are ever queried: sort columns and search columns are checked
// against this registry, never taken from the request as-is.
//
// Column types: 'text' | 'number' | 'boolean' | 'date' | 'json' | 'uuid'
// `auth_users` is virtual: rows come from the Auth admin API, not from PostgREST.
// `optional` tables come from migration 0006: listed as unavailable until it is applied
// (and granted to service_role). `mayBeMissing` columns were added to 0006 later: until
// it is re-run they are shown empty instead of failing the whole table.
import { HttpError, fail } from '@/utils/api/errors'
import { isMissingColumn } from '@/utils/ai/ledger'
import { isUuid } from '@/utils/api/validate'
import { countRows, ilikeAny, lastPage, parsePagination, queryText, selectPage, unavailableTable } from '@/utils/api/admin/query'
import { getRole, isAdmin, isApproved } from '@/utils/auth/server'
import { countAuthUsers, listAllAuthUsers, providersOf } from '@/utils/api/admin/users'

export const TRUNCATE_AT = 500

const col = (name, type, extra = {}) => ({ name, type, ...extra })

export const TABLES = {
  auth_users: {
    label: 'Comptes (Auth)',
    virtual: true,
    key: 'id',
    columns: [
      col('id', 'uuid'),
      col('email', 'text'),
      col('created_at', 'date'),
      col('last_sign_in_at', 'date'),
      col('email_confirmed_at', 'date'),
      col('role', 'text'),
      col('is_admin', 'boolean'),
      col('approved', 'boolean'),
      col('banned_until', 'date'),
      col('providers', 'json'),
    ],
    search: ['email', 'role'],
    sort: { column: 'created_at', dir: 'desc' },
  },
  profiles: {
    label: 'Profils',
    key: 'id',
    columns: [
      col('id', 'uuid'),
      col('email', 'text'),
      col('full_name', 'text'),
      col('level', 'text'),
      col('goals', 'text'),
      col('interests', 'text'),
      col('drive_folder_url', 'text'),
      col('onboarded_at', 'date'),
      col('created_at', 'date'),
      col('updated_at', 'date'),
    ],
    search: ['email', 'full_name', 'level', 'goals', 'interests'],
    sort: { column: 'created_at', dir: 'desc' },
  },
  student_notes: {
    label: 'Notes privées',
    key: 'student_id',
    columns: [col('student_id', 'uuid'), col('notes', 'text'), col('ai_context', 'text'), col('updated_at', 'date')],
    search: ['notes', 'ai_context'],
    sort: { column: 'updated_at', dir: 'desc' },
  },
  lessons: {
    label: 'Cours',
    key: 'id',
    columns: [
      col('id', 'uuid'),
      col('student_id', 'uuid'),
      col('title', 'text'),
      col('lesson_date', 'date'),
      col('status', 'text'),
      col('hidden', 'boolean'),
      col('error', 'text'),
      col('content', 'json'),
      col('exercises', 'json'),
      col('drive_url', 'text'),
      col('source_kind', 'text'),
      col('source_name', 'text'),
      col('transcript', 'text', { alwaysTruncate: true }),
      col('canva', 'text', { alwaysTruncate: true }),
      col('source_text', 'text', { alwaysTruncate: true }),
      col('generation_options', 'json'),
      col('client_key', 'uuid'),
      col('ai_model', 'text'),
      col('ai_usage', 'json'),
      col('generated_at', 'date'),
      col('created_at', 'date'),
      col('updated_at', 'date'),
    ],
    search: ['title', 'status', 'error', 'ai_model', 'source_name'],
    sort: { column: 'created_at', dir: 'desc' },
  },
  practice_sessions: {
    label: 'Sessions de pratique',
    key: 'id',
    columns: [
      col('id', 'uuid'),
      col('lesson_id', 'uuid'),
      col('student_id', 'uuid'),
      col('score', 'number'),
      col('total', 'number'),
      col('answers', 'json'),
      col('client_run_id', 'uuid'),
      col('completed_at', 'date'),
    ],
    search: [],
    sort: { column: 'completed_at', dir: 'desc' },
  },
  review_attempts: {
    label: 'Révisions',
    key: 'id',
    columns: [
      col('id', 'uuid'),
      col('student_id', 'uuid'),
      col('lesson_id', 'uuid'),
      col('exercise_id', 'text'),
      col('correct', 'boolean'),
      col('value', 'json'),
      col('created_at', 'date'),
    ],
    search: ['exercise_id'],
    sort: { column: 'created_at', dir: 'desc' },
  },
  lesson_plans: {
    label: 'Plans de cours',
    optional: true,
    key: 'id',
    columns: [
      col('id', 'uuid'),
      col('student_id', 'uuid'),
      col('focus', 'text'),
      col('content', 'json'),
      col('ai_model', 'text'),
      col('created_at', 'date'),
    ],
    search: ['focus', 'ai_model'],
    sort: { column: 'created_at', dir: 'desc' },
  },
  ai_generations: {
    label: 'Générations IA',
    optional: true,
    key: 'id',
    columns: [
      col('id', 'uuid'),
      col('kind', 'text'),
      col('lesson_id', 'uuid'),
      col('student_id', 'uuid'),
      col('model', 'text'),
      col('ok', 'boolean'),
      col('error', 'text'),
      col('prompt_tokens', 'number'),
      col('completion_tokens', 'number'),
      col('duration_ms', 'number'),
      col('cost_usd', 'number', { mayBeMissing: true }),
      col('created_at', 'date'),
    ],
    search: ['kind', 'model', 'error'],
    sort: { column: 'created_at', dir: 'desc' },
  },
  admin_audit_log: {
    label: "Journal d'audit",
    key: 'id',
    columns: [
      col('id', 'uuid'),
      col('admin_id', 'uuid'),
      col('admin_email', 'text'),
      col('action', 'text'),
      col('entity', 'text'),
      col('entity_id', 'text'),
      col('details', 'json'),
      col('created_at', 'date'),
    ],
    search: ['admin_email', 'action', 'entity', 'entity_id'],
    sort: { column: 'created_at', dir: 'desc' },
  },
}

export const TABLE_NAMES = Object.keys(TABLES)

/** Registry entry, or null for an unknown table (own properties only). */
export function tableSpec(name) {
  return typeof name === 'string' && Object.prototype.hasOwnProperty.call(TABLES, name) ? TABLES[name] : null
}

const publicColumns = (spec) => spec.columns.map(({ name, type }) => ({ name, type }))

/**
 * Sort column + direction from the query, checked against the registry (400 otherwise).
 * @returns {{ column: string, ascending: boolean }}
 */
export function parseSort(spec, query = {}) {
  const sort = queryText(query.sort, 64)
  const dir = queryText(query.dir, 8).toLowerCase()
  if (sort && !spec.columns.some((c) => c.name === sort)) fail('Colonne de tri inconnue.')
  if (dir && dir !== 'asc' && dir !== 'desc') fail('Ordre de tri invalide (asc ou desc).')
  const column = sort || spec.sort.column
  const direction = dir || (sort ? 'asc' : spec.sort.dir)
  return { column, ascending: direction === 'asc' }
}

function truncate(value, max = TRUNCATE_AT) {
  return value.length > max ? `${value.slice(0, max)}…` : value
}

/** Row with registry columns only; text cut to 500 chars, json stringified (then cut). */
export function formatRow(spec, row) {
  const out = {}
  for (const c of spec.columns) {
    let value = row?.[c.name] ?? null
    if (value !== null && c.type === 'json') value = truncate(JSON.stringify(value))
    else if (typeof value === 'string' && (c.type === 'text' || c.alwaysTruncate)) value = truncate(value)
    out[c.name] = value
  }
  return out
}

/** `.or()` filter for `q` over the table's text columns (+ exact match on uuid columns when q is a UUID). */
export function searchFilter(spec, q) {
  const parts = []
  if (spec.search.length) parts.push(ilikeAny(spec.search, q))
  if (isUuid(q)) {
    for (const c of spec.columns) if (c.type === 'uuid') parts.push(`${c.name}.eq.${q.toLowerCase()}`)
  }
  return parts.join(',')
}

function authRow(user) {
  return {
    id: user.id,
    email: user.email || '',
    created_at: user.created_at || null,
    last_sign_in_at: user.last_sign_in_at || null,
    email_confirmed_at: user.email_confirmed_at || null,
    role: getRole(user),
    is_admin: isAdmin(user),
    approved: isApproved(user),
    banned_until: user.banned_until || null,
    providers: providersOf(user),
  }
}

function compare(a, b) {
  if (a === b) return 0
  if (a === null || a === undefined) return 1
  if (b === null || b === undefined) return -1
  if (typeof a === 'string' && typeof b === 'string') return a.localeCompare(b)
  return a < b ? -1 : 1
}

async function readAuthUsers(admin, spec, { q, sort, page, perPage }) {
  const needle = q.toLowerCase()
  const rows = (await listAllAuthUsers(admin))
    .map(authRow)
    .filter((r) => !q || spec.search.some((c) => String(r[c] || '').toLowerCase().includes(needle)) || r.id === needle)
    .sort((a, b) => {
      const c = compare(a[sort.column], b[sort.column])
      return sort.ascending ? c : -c
    })
  // Same clamping as selectPage: a page past the end shows the last one
  const current = Math.min(page, lastPage(rows.length, perPage))
  const from = (current - 1) * perPage
  return { rows: rows.slice(from, from + perPage), total: rows.length, page: current }
}

function selectColumns(admin, name, spec, columns, { filter, sort, page, perPage }) {
  return selectPage(
    (options) => {
      let request = admin.from(name).select(columns.map((c) => c.name).join(', '), options)
      if (filter) request = request.or(filter)
      request = request.order(sort.column, { ascending: sort.ascending, nullsFirst: false })
      return sort.column === spec.key ? request : request.order(spec.key, { ascending: true })
    },
    { page, perPage }
  )
}

async function readTable(admin, name, spec, { q, sort, page, perPage }) {
  const filter = q ? searchFilter(spec, q) : ''
  if (q && !filter) return { rows: [], total: 0, page: 1 } // nothing searchable matches
  try {
    return await selectColumns(admin, name, spec, spec.columns, { filter, sort, page, perPage })
  } catch (err) {
    const present = spec.columns.filter((c) => !c.mayBeMissing)
    if (!isMissingColumn(err) || present.length === spec.columns.length) throw err
    // Without the late columns (formatRow shows them empty); a sort on one falls back to the default
    const fallback = present.some((c) => c.name === sort.column) ? sort : { column: spec.sort.column, ascending: spec.sort.dir === 'asc' }
    return selectColumns(admin, name, spec, present, { filter, sort: fallback, page, perPage })
  }
}

const UNAVAILABLE = {
  missing: () => new HttpError(404, 'Cette table n’existe pas encore : applique la migration 0006 dans Supabase.', 'missing_table'),
  forbidden: () =>
    new HttpError(500, 'Accès refusé à cette table : accorde ses droits au rôle service_role (voir la migration 0006).', 'forbidden_table'),
}

/**
 * GET /api/admin/tables/[table] payload. Throws BadRequest on invalid sort/dir, and
 * 404 / 500 with a French explanation when an optional table is missing / not granted.
 */
export async function readTablePage(admin, name, query = {}) {
  const spec = tableSpec(name)
  if (!spec) return null
  const q = queryText(query.q)
  const sort = parseSort(spec, query)
  const { page, perPage } = parsePagination(query)
  let result
  try {
    result = spec.virtual
      ? await readAuthUsers(admin, spec, { q, sort, page, perPage })
      : await readTable(admin, name, spec, { q, sort, page, perPage })
  } catch (err) {
    const reason = spec.optional ? unavailableTable(err) : null
    throw reason ? UNAVAILABLE[reason]() : err
  }
  return {
    table: name,
    label: spec.label,
    columns: publicColumns(spec),
    rows: result.rows.map((r) => formatRow(spec, r)),
    total: result.total,
    page: result.page,
    perPage,
  }
}

/** [{ name, label, count, unavailable? }] for every registered table (unavailable: 'missing' | 'forbidden', count null). */
export async function listTables(admin) {
  return Promise.all(
    TABLE_NAMES.map(async (name) => {
      const spec = TABLES[name]
      try {
        const count = spec.virtual ? await countAuthUsers(admin) : await countRows(admin, name)
        return { name, label: spec.label, count }
      } catch (err) {
        const reason = spec.optional ? unavailableTable(err) : null
        if (!reason) throw err
        if (reason === 'forbidden') console.error(`[admin] table ${name} not granted to service_role:`, err)
        return { name, label: spec.label, count: null, unavailable: reason }
      }
    })
  )
}
