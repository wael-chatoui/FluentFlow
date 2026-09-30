// Pure helpers about a lesson's progress, shared by the student Home and Lessons pages.
// `lesson` is one item of GET /api/student/lessons (best_score / best_total are null
// when the current version of the lesson was never practiced).
import { parseLessonDate, percent } from '@/components/lesson/format'

export function exerciseCount(lesson) {
  return Math.max(0, Number(lesson?.exercise_count) || 0)
}

/** Distinct words & expressions of the lesson (same rule as the Words page). */
export function vocabCount(lesson) {
  return Math.max(0, Number(lesson?.vocab_count) || 0)
}

/** Best score in % (0–100), or null if the lesson was never practiced. */
export function bestPct(lesson) {
  if (!lesson || lesson.best_score == null || lesson.best_total == null) return null
  return percent(Number(lesson.best_score), Number(lesson.best_total))
}

export function isPracticed(lesson) {
  return bestPct(lesson) !== null
}

/** Practiced before the teacher last changed the exercises, not since (progress was reset). */
export function isUpdated(lesson) {
  return Boolean(lesson?.updated_since_practice) && !isPracticed(lesson)
}

/** Newest first by lesson_date (stable: keeps the API order on ties). */
export function sortNewestFirst(lessons) {
  const list = Array.isArray(lessons) ? lessons.filter(Boolean) : []
  return list
    .map((lesson, i) => ({ lesson, i }))
    .sort((a, b) => String(b.lesson.lesson_date || '').localeCompare(String(a.lesson.lesson_date || '')) || a.i - b.i)
    .map(({ lesson }) => lesson)
}

export const FILTERS = [
  { id: 'all', label: 'All', test: () => true },
  { id: 'todo', label: 'To practice', test: (l) => exerciseCount(l) > 0 && !isPracticed(l) },
  { id: 'work', label: 'Needs work', test: (l) => isPracticed(l) && bestPct(l) < 80 },
  { id: 'mastered', label: 'Mastered', test: (l) => bestPct(l) === 100 },
]

export function filterById(id) {
  return FILTERS.find((f) => f.id === id) || FILTERS[0]
}

/**
 * Progress summary for the Home page.
 * @param {object[]} lessons
 * @param {number} wordCount  distinct words & expressions (GET /api/student/lessons `wordCount`)
 */
export function progressStats(lessons, wordCount) {
  const list = Array.isArray(lessons) ? lessons : []
  const pcts = list.filter(isPracticed).map(bestPct)
  const mastery = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null
  return { lessons: list.length, mastery, words: Math.max(0, Number(wordCount) || 0) }
}

/** Practiced lessons, oldest → newest, at most `max` (the most recent ones). */
export function scoreHistory(lessons, max = 8) {
  const practiced = sortNewestFirst(lessons).filter(isPracticed).slice(0, max)
  return practiced.reverse()
}

// Stable, friendly emoji per lesson (same idea as accents.js)
const LESSON_EMOJIS = ['📘', '🥐', '🗼', '🧀', '🎨', '☕', '🚲', '🌻', '🎭', '🍓', '⛵', '🎶']

export function lessonEmoji(id) {
  const s = String(id || '')
  let h = 7
  for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0
  return LESSON_EMOJIS[h % LESSON_EMOJIS.length]
}

/** 'YYYY-MM-DD' → "Sep 3" (local date), '' if invalid. */
export function shortDate(value) {
  const date = parseLessonDate(value)
  return date ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''
}

const DAY_MS = 24 * 60 * 60 * 1000
const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/**
 * How long ago a timestamp was, in calendar days (local time): "today", "yesterday",
 * "3 days ago", "2 weeks ago", "5 months ago", "over a year ago"; '' if invalid.
 */
export function timeAgo(timestamp, now = new Date()) {
  const ms = Date.parse(timestamp)
  if (Number.isNaN(ms)) return ''
  const days = Math.round((startOfDay(now) - startOfDay(new Date(ms))) / DAY_MS)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) {
    const weeks = Math.round(days / 7)
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`
  }
  if (days < 365) {
    const months = Math.max(1, Math.round(days / 30))
    return months === 1 ? '1 month ago' : `${months} months ago`
  }
  return 'over a year ago'
}
