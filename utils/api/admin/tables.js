// Read-only table explorer registry (back office). Only the tables and columns
// listed here are ever queried: sort columns and search columns are checked
// against this registry, never taken from the request as-is.
//
// Column types: 'text' | 'number' | 'boolean' | 'date' | 'json' | 'uuid'
// `auth_users` is virtual: rows come from the Auth admin API, not from PostgREST.
import { fail } from '@/utils/api/errors'
import { isUuid } from '@/utils/api/validate'
import { countRows, ilikeAny, parsePagination, queryText } from '@/utils/api/admin/query'
import { getRole, isAdmin } from '@/utils/auth/server'
import { listAllAuthUsers, providersOf } from '@/utils/api/admin/users'

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
      col('role', 'text'),
      col('is_admin', 'boolean'),
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
    columns: [col('student_id', 'uuid'), col('notes', 'text'), col('updated_at', 'date')],
    search: ['notes'],
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
      col('error', 'text'),
      col('content', 'json'),
      col('exercises', 'json'),
      col('drive_url', 'text'),
      col('transcript', 'text', { alwaysTruncate: true }),
      col('canva', 'text', { alwaysTruncate: true }),
      col('ai_model', 'text'),
      col('ai_usage', 'json'),
      col('generated_at', 'date'),
      col('created_at', 'date'),
      col('updated_at', 'date'),
    ],
    search: ['title', 'status', 'error', 'ai_model'],
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
    role: getRole(user),
    is_admin: isAdmin(user),
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

async function readAuthUsers(admin, spec, { q, sort, from, perPage }) {
  const needle = q.toLowerCase()
  const rows = (await listAllAuthUsers(admin))
    .map(authRow)
    .filter((r) => !q || spec.search.some((c) => String(r[c] || '').toLowerCase().includes(needle)) || r.id === needle)
    .sort((a, b) => {
      const c = compare(a[sort.column], b[sort.column])
      return sort.ascending ? c : -c
    })
  return { rows: rows.slice(from, from + perPage), total: rows.length }
}

async function readTable(admin, name, spec, { q, sort, from, to }) {
  let request = admin.from(name).select(spec.columns.map((c) => c.name).join(', '), { count: 'exact' })
  if (q) {
    const filter = searchFilter(spec, q)
    if (!filter) return { rows: [], total: 0 } // nothing searchable matches
    request = request.or(filter)
  }
  request = request.order(sort.column, { ascending: sort.ascending, nullsFirst: false })
  if (sort.column !== spec.key) request = request.order(spec.key, { ascending: true })
  const { data, count, error } = await request.range(from, to)
  if (error) throw error
  return { rows: data || [], total: count || 0 }
}

/** GET /api/admin/tables/[table] payload. Throws BadRequest on invalid sort/dir. */
export async function readTablePage(admin, name, query = {}) {
  const spec = tableSpec(name)
  if (!spec) return null
  const q = queryText(query.q)
  const sort = parseSort(spec, query)
  const { page, perPage, from, to } = parsePagination(query)
  const { rows, total } = spec.virtual
    ? await readAuthUsers(admin, spec, { q, sort, from, perPage })
    : await readTable(admin, name, spec, { q, sort, from, to })
  return {
    table: name,
    label: spec.label,
    columns: publicColumns(spec),
    rows: rows.map((r) => formatRow(spec, r)),
    total,
    page,
    perPage,
  }
}

/** [{ name, label, count }] for every registered table. */
export async function listTables(admin) {
  return Promise.all(
    TABLE_NAMES.map(async (name) => {
      const spec = TABLES[name]
      const count = spec.virtual ? (await listAllAuthUsers(admin)).length : await countRows(admin, name)
      return { name, label: spec.label, count }
    })
  )
}
