// Document rows of the import page: shape, derived title / date checks, readiness
// and ordering.
import { parseLocalDate, todayLocal } from '@/components/teacher/format'
import { newClientKey, nextKey, sourceIssue } from '@/components/teacher/import/importUtils'
import { titleFromName } from '@/utils/import/detect'
import { IMPORT_LIMITS } from '@/utils/import/limits'
import { sanitizeSourceName } from '@/utils/import/text'

/** Run states in which the row is being handled (the page counts as busy). */
export const ACTIVE_RUNS = new Set(['queued', 'sending', 'generating'])

/**
 * @param {object} base  fields to set (kind, file, url, label, size, sourceName, dedupeKey…)
 */
export function newRow(base) {
  return {
    key: nextKey(),
    clientKey: newClientKey(), // same key on every retry: the server never creates a duplicate
    kind: 'pdf', // 'pdf' | 'text' | 'link'
    file: null,
    url: '',
    label: '',
    size: 0,
    sourceName: '',
    dedupeKey: '',
    title: null, // null = derived from the source name
    lessonNumber: null,
    lessonDate: '', // required: never defaults to today (historical documents)
    dateFrom: null, // 'name' | 'text' (detected) | 'all' (applied to every row) | null (typed / empty)
    extract: 'pending', // 'pending' | 'loading' | 'done' | 'error'
    extractError: null,
    text: '',
    pages: null,
    warning: null,
    warningDismissed: false,
    textEdited: false,
    manual: false,
    showText: false,
    run: 'idle', // 'idle' | 'queued' | 'sending' | 'generating' | 'published' | 'failed'
    queueSeq: 0,
    runError: null,
    lessonId: null,
    hidden: false, // created as a draft (« Relire avant de publier »)
    stale: false,
    sent: false, // an import request left: the lesson may exist on the server
    pollTrouble: false,
    startedAt: null,
    restored: false, // rebuilt from sessionStorage after a reload (no text / file)
    ...base,
  }
}

export function rowTitle(row, student) {
  return row.title ?? titleFromName(row.sourceName || row.label, student).title
}

/** French problem with the row's date, or null. */
export function dateError(row) {
  if (!row.lessonDate) return 'Indique la date du cours.'
  if (!parseLocalDate(row.lessonDate)) return 'Date invalide.'
  if (row.lessonDate > todayLocal()) return 'Cette date est dans le futur : vérifie-la.'
  return null
}

/** Ready for its first import (failed rows go through « Réessayer »). */
export function isReady(row) {
  return !row.lessonId && row.run === 'idle' && !sourceIssue(row) && !dateError(row)
}

/** A failed row the teacher can retry: regenerate an existing lesson, or send the document again. */
export function canRetry(row) {
  return row.run === 'failed' && (Boolean(row.lessonId) || (!row.restored && !sourceIssue(row) && !dateError(row)))
}

/** `sourceName` sent to the API (≤ 200 characters, never empty). */
export function sourceNameFor(row) {
  return sanitizeSourceName(row.sourceName || row.label, 'Document').slice(0, IMPORT_LIMITS.maxSourceName)
}

const collator = new Intl.Collator('fr', { numeric: true, sensitivity: 'base' })

/** Display order of new files: lesson number (L01, L02…), then name. */
export function byLessonNumber(a, b) {
  const na = a.lessonNumber ?? Infinity
  const nb = b.lessonNumber ?? Infinity
  if (na !== nb) return na - nb
  return collator.compare(a.sourceName || a.label, b.sourceName || b.label)
}

/**
 * Generation order: oldest lesson first, so each lesson's AI context (previous
 * lessons of the student) already contains the ones before it.
 */
export function byLessonDate(a, b) {
  if (a.lessonDate !== b.lessonDate) return a.lessonDate < b.lessonDate ? -1 : 1
  return byLessonNumber(a, b)
}
