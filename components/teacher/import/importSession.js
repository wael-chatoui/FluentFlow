// Keeps the import queue in sessionStorage (this tab only) so a reload, or coming
// back to the page, still shows the lessons already created with their links.
// The document text and the files are never stored: link rows are extracted again,
// PDF / text rows become "to add again" entries that keep their settings and
// clientKey (re-adding the same file cannot create a duplicate lesson).
import { isValidId } from '@/components/teacher/format'
import { newRow } from '@/components/teacher/import/rows'

const STORAGE_KEY = 'teacher.import.queue'
const VERSION = 1
const MAX_AGE_MS = 24 * 60 * 60 * 1000

const KEPT_FIELDS = [
  'key',
  'kind',
  'sourceName',
  'label',
  'size',
  'dedupeKey',
  'clientKey',
  'lessonNumber',
  'lessonDate',
  'dateFrom',
  'lessonId',
  'run',
  'runError',
  'hidden',
  'stale',
  'sent',
]

function pick(row, fields) {
  const out = {}
  fields.forEach((f) => {
    if (row[f] !== undefined) out[f] = row[f]
  })
  return out
}

/**
 * Serialized queue, or null when there is nothing worth keeping.
 * @param {string} studentId
 * @param {object[]} rows
 * @param {object[]} orphans  "to add again" entries restored earlier and not re-added yet
 * @param {(row: object) => string} titleOf  title shown for a row (derived titles are resolved)
 */
export function serializeQueue(studentId, rows, orphans, titleOf) {
  if (!studentId || (!rows.length && !orphans.length)) return null
  const saved = rows.map((row) => ({
    ...pick(row, KEPT_FIELDS),
    // Created lessons keep the title shown; others keep "derived" (null) or the typed one
    title: row.lessonId ? titleOf(row) : row.title,
    url: row.kind === 'link' ? row.url : undefined,
  }))
  return JSON.stringify({ v: VERSION, savedAt: Date.now(), studentId, rows: saved, orphans })
}

export function writeQueue(serialized) {
  try {
    if (serialized) window.sessionStorage.setItem(STORAGE_KEY, serialized)
    else window.sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage full or disabled (private mode): the queue just won't survive a reload
  }
}

export function clearQueue() {
  writeQueue(null)
}

/**
 * Queue saved by this tab.
 * @returns {{ studentId: string, rows: object[], orphans: object[] } | null}
 *   `rows`: created lessons (read-only, polled while generating) and link rows
 *   (extracted again); `orphans`: files to add again.
 */
export function readQueue() {
  let data
  try {
    data = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) || 'null')
  } catch {
    return null
  }
  if (!data || data.v !== VERSION || !isValidId(data.studentId) || !Array.isArray(data.rows)) return null
  if (!(Date.now() - Number(data.savedAt) < MAX_AGE_MS)) return null

  const rows = []
  const orphans = Array.isArray(data.orphans)
    ? data.orphans.filter((o) => o && typeof o.dedupeKey === 'string' && isValidId(o.clientKey))
    : []
  data.rows.forEach((saved) => {
    // Ids end up in API paths and requests: only well-formed uuids come back
    if (!saved || !isValidId(saved.clientKey)) return
    if (saved.lessonId && !isValidId(saved.lessonId)) return
    if (saved.lessonId) {
      const wasActive = saved.run === 'queued' || saved.run === 'sending' || saved.run === 'generating'
      rows.push(
        newRow({
          ...saved,
          extract: 'done',
          restored: true,
          // Still generating on the server: poll it again
          run: wasActive ? 'generating' : saved.run === 'published' ? 'published' : 'failed',
        })
      )
    } else if (saved.kind === 'link' && saved.url) {
      rows.push(newRow({ ...saved, run: 'idle', runError: null, extract: 'pending' }))
    } else if (saved.dedupeKey) {
      orphans.push(pick(saved, ['sourceName', 'dedupeKey', 'clientKey', 'title', 'lessonNumber', 'lessonDate', 'dateFrom', 'sent']))
    }
  })
  return { studentId: data.studentId, rows, orphans }
}
