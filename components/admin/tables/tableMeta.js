// Explorer helpers: per-table icons, links to the dedicated editors, CSV export.

export const TABLE_ICONS = {
  auth_users: '🔐',
  profiles: '👤',
  student_notes: '🗒️',
  lessons: '📚',
  practice_sessions: '🏋️',
  review_attempts: '🔁',
  admin_audit_log: '🧾',
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const isId = (v) => typeof v === 'string' && UUID_RE.test(v)

/** Dedicated editor for a row of `table`, or null. */
export function rowLink(table, row) {
  if (!row) return null
  if (table === 'student_notes' && isId(row.student_id)) return `/admin/users/${row.student_id}`
  if (!isId(row.id)) return null
  if (table === 'lessons') return `/admin/lessons/${row.id}`
  if (table === 'profiles' || table === 'auth_users') return `/admin/users/${row.id}`
  return null
}

// Foreign-key-like columns that point to a user or a lesson
const USER_COLUMNS = ['student_id', 'user_id', 'teacher_id', 'admin_id']
const LESSON_COLUMNS = ['lesson_id']

/** Link for a cell value (e.g. student_id → /admin/users/…), or null. */
export function cellLink(table, column, value) {
  if (!isId(value)) return null
  if (USER_COLUMNS.includes(column)) return `/admin/users/${value}`
  if (LESSON_COLUMNS.includes(column)) return `/admin/lessons/${value}`
  if (column === 'id' && (table === 'profiles' || table === 'auth_users')) return `/admin/users/${value}`
  if (column === 'id' && table === 'lessons') return `/admin/lessons/${value}`
  return null
}

// ---------------------------------------------------------------------------
// CSV (RFC 4180, ';' separator + UTF-8 BOM so French Excel opens it directly)
// ---------------------------------------------------------------------------
export const CSV_SEPARATOR = ';'

function csvCell(value) {
  if (value === null || value === undefined) return ''
  let s = typeof value === 'object' ? JSON.stringify(value) : String(value)
  // Neutralise spreadsheet formulas in text cells (CSV injection)
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[";,\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(columns, rows) {
  const lines = [columns.map(csvCell).join(CSV_SEPARATOR)]
  rows.forEach((row) => lines.push(columns.map((c) => csvCell(row[c])).join(CSV_SEPARATOR)))
  return `﻿${lines.join('\r\n')}\r\n`
}

export function downloadText(filename, text, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** Pretty-printed value for the "voir" dialog. */
export function prettyValue(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  if (typeof value === 'string') {
    const t = value.trim()
    if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
      try {
        return JSON.stringify(JSON.parse(t), null, 2)
      } catch {
        return value
      }
    }
    return value
  }
  return String(value)
}
