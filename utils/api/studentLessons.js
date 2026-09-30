// What a student may see of their lessons, in one place. Every student route
// (lessons, lesson, practice, review, vocabulary, mistakes) starts its lesson query
// from visibleLessons(), so the visibility rule cannot drift between routes.
//
// No server-only imports (the query helpers take the admin client as an argument):
// the word-bank helpers are also used by the browser, so search and dedupe fold
// French text the same way.
import { micros } from '@/utils/api/progress'
import { stripAccents } from '@/utils/lesson/grading'

// 'generating' only shows when the row already has content: a regeneration in
// progress keeps the previous version visible.
export const STUDENT_VISIBLE_STATUSES = ['published', 'generating']

/**
 * The student's own visible lessons: published (or regenerating), with content,
 * and not hidden by the teacher (draft to review, or withdrawn).
 * Returns the query builder: callers add filters, ordering, maybeSingle()…
 * @param {import('@supabase/supabase-js').SupabaseClient} admin  service-role client
 * @param {string} studentId  the authenticated student's id (never from the request)
 * @param {string} columns
 */
export function visibleLessons(admin, studentId, columns) {
  return admin
    .from('lessons')
    .select(columns)
    .eq('student_id', studentId)
    .in('status', STUDENT_VISIBLE_STATUSES)
    .not('content', 'is', null)
    .eq('hidden', false)
}

/** Version token of a lesson's exercises: lessons.generated_at ('' for very old rows). */
export const lessonVersion = (lesson) => lesson?.generated_at || ''

/**
 * Whether the version the client practiced (echoed back in a POST) is still the
 * lesson's current one. Compared as timestamps, so formatting cannot cause a false 409.
 */
export function isSameVersion(clientVersion, lesson) {
  if (typeof clientVersion !== 'string') return false
  const current = lessonVersion(lesson)
  if (!current || !clientVersion) return current === clientVersion
  const a = micros(clientVersion)
  const b = micros(current)
  return Number.isNaN(a) || Number.isNaN(b) ? clientVersion === current : a === b
}

/**
 * Ids of the `before` lessons whose version changed in `after` (fresh rows { id, generated_at }),
 * or that are missing from it (deleted).
 */
export function replacedLessons(before, after) {
  const fresh = new Map((Array.isArray(after) ? after : []).map((l) => [l.id, l]))
  const ids = new Set()
  for (const l of Array.isArray(before) ? before : []) {
    if (!fresh.has(l.id) || !isSameVersion(lessonVersion(l), fresh.get(l.id))) ids.add(l.id)
  }
  return ids
}

/**
 * Student saves check the version, grade, then insert, with no transaction around them: a
 * teacher edit or regeneration can land in between. They call this once their rows are
 * inserted and undo those of the lessons it returns (graded against replaced exercises).
 * @param {{ id: string, generated_at?: string|null }[]} lessons  as read before grading
 * @returns {Promise<Set<string>>} ids of the lessons replaced (or deleted) since
 */
export async function lessonsReplacedSince(admin, lessons) {
  if (!lessons.length) return new Set()
  const ids = lessons.map((l) => l.id)
  const { data, error } = await admin.from('lessons').select('id, generated_at').in('id', ids)
  if (error) throw error
  return replacedLessons(lessons, data)
}

// ---------------------------------------------------------------------------
// Word bank
// ---------------------------------------------------------------------------

const APOSTROPHES = /[‘’ʼ`´]/g
const PUNCTUATION = /[.,!?;:…"«»“”„()[\]{}¿¡–—-]+/g

/**
 * Case-, accent-, apostrophe- and punctuation-insensitive form of French (or English)
 * text: the word bank's dedupe key and its search ("C’est !" = "c'est", "peut-être" = "peut etre").
 */
export function foldFrench(value) {
  return stripAccents(String(value ?? '').normalize('NFC').toLowerCase())
    .replace(/\*\*/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae')
    .replace(APOSTROPHES, "'")
    .replace(PUNCTUATION, ' ')
    .replace(/\s*'\s*/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

const entries = (value) =>
  (Array.isArray(value) ? value : []).filter(
    (v) => v && typeof v.fr === 'string' && foldFrench(v.fr) && typeof v.en === 'string'
  )

// Vocabulary then expressions of one lesson (`vocabulary` / `expressions` = content fields)
function lessonEntries(lesson) {
  return [
    ...entries(lesson?.vocabulary).map((v) => ({ v, kind: 'word' })),
    ...entries(lesson?.expressions).map((v) => ({ v, kind: 'expression' })),
  ]
}

/**
 * Word bank of the given lessons (newest first): one item per French word/expression
 * (foldFrench key); on a repeat, the newest lesson's version is kept (lessonId/lessonTitle)
 * and `lessonIds` lists every lesson it appears in (so a lesson's flashcards deck is complete).
 * @param {{ id: string, title: string, lesson_date: string, vocabulary?: object[], expressions?: object[] }[]} lessons
 * @returns {{ fr: string, en: string, example: string, kind: 'word'|'expression', lessonId: string,
 *   lessonTitle: string, lesson_date: string, lessonIds: string[] }[]}
 */
export function collectVocabulary(lessons) {
  const byKey = new Map()
  const items = []
  for (const lesson of Array.isArray(lessons) ? lessons : []) {
    for (const { v, kind } of lessonEntries(lesson)) {
      const key = foldFrench(v.fr)
      const known = byKey.get(key)
      if (known) {
        if (!known.lessonIds.includes(lesson.id)) known.lessonIds.push(lesson.id)
        continue
      }
      const item = {
        fr: v.fr.trim(),
        en: v.en.trim(),
        example: typeof v.example === 'string' ? v.example.trim() : '',
        kind,
        lessonId: lesson.id,
        lessonTitle: lesson.title,
        lesson_date: lesson.lesson_date,
        lessonIds: [lesson.id],
      }
      byKey.set(key, item)
      items.push(item)
    }
  }
  return items
}

/** Lessons that have at least one word or expression, in the given order. */
export function lessonsWithWords(lessons) {
  return (Array.isArray(lessons) ? lessons : [])
    .filter((l) => lessonEntries(l).length > 0)
    .map((l) => ({ id: l.id, title: l.title, lesson_date: l.lesson_date }))
}

/** Distinct words & expressions of one lesson (same rule as the word bank). */
export function lessonWordCount(lesson) {
  return new Set(lessonEntries(lesson).map(({ v }) => foldFrench(v.fr))).size
}
