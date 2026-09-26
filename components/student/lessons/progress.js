// Pure helpers about a lesson's progress, shared by the student Home and Lessons pages.
// `lesson` is one item of GET /api/student/lessons (best_score / best_total are null
// when the lesson was never practised).
import { parseLessonDate, percent } from '@/components/lesson/format'

export function exerciseCount(lesson) {
  return Math.max(0, Number(lesson?.exercise_count) || 0)
}

export function vocabCount(lesson) {
  return Math.max(0, Number(lesson?.vocab_count) || 0)
}

/** Best score in % (0–100), or null if the lesson was never practised. */
export function bestPct(lesson) {
  if (!lesson || lesson.best_score == null || lesson.best_total == null) return null
  return percent(Number(lesson.best_score), Number(lesson.best_total))
}

export function isPractised(lesson) {
  return bestPct(lesson) !== null
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
  { id: 'todo', label: 'To practise', test: (l) => exerciseCount(l) > 0 && !isPractised(l) },
  { id: 'work', label: 'Needs work', test: (l) => isPractised(l) && bestPct(l) < 80 },
  { id: 'mastered', label: 'Mastered', test: (l) => bestPct(l) === 100 },
]

export function filterById(id) {
  return FILTERS.find((f) => f.id === id) || FILTERS[0]
}

/** Progress summary for the Home page. */
export function progressStats(lessons) {
  const list = Array.isArray(lessons) ? lessons : []
  const practised = list.filter(isPractised)
  const pcts = practised.map(bestPct)
  const mastery = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null
  const words = list.reduce((sum, l) => sum + vocabCount(l), 0)
  return { lessons: list.length, practised: practised.length, mastery, words }
}

/** Practised lessons, oldest → newest, at most `max` (the most recent ones). */
export function scoreHistory(lessons, max = 8) {
  const practised = sortNewestFirst(lessons).filter(isPractised).slice(0, max)
  return practised.reverse()
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
