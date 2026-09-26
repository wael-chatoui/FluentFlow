// Picks the single most useful next action for the Home "Up next" card.
// Pure function (no React), so it is easy to reason about and test.
import { bestPct, exerciseCount, isPractised, sortNewestFirst } from '@/components/student/lessons/progress'

/**
 * @param {Array<object>} lessons  items of GET /api/student/lessons
 * @param {number} mistakeCount
 * @returns {{ kind: 'empty' }
 *   | { kind: 'new', lesson: object }
 *   | { kind: 'mistakes', count: number }
 *   | { kind: 'improve', lesson: object, pct: number }
 *   | { kind: 'mastered' }
 *   | { kind: 'recap', lesson: object }}
 */
export function computeUpNext(lessons, mistakeCount) {
  const list = sortNewestFirst(lessons)
  if (list.length === 0) return { kind: 'empty' }

  // 1) Newest lesson with exercises that was never practised
  const fresh = list.find((l) => exerciseCount(l) > 0 && !isPractised(l))
  if (fresh) return { kind: 'new', lesson: fresh }

  // 2) Mistakes waiting in the review queue
  const count = Math.max(0, Number(mistakeCount) || 0)
  if (count > 0) return { kind: 'mistakes', count }

  // 3) Practised lesson with the lowest best score under 100% (newest wins ties)
  let weakest = null
  for (const lesson of list) {
    const pct = bestPct(lesson)
    if (pct === null || pct >= 100) continue
    if (!weakest || pct < weakest.pct) weakest = { lesson, pct }
  }
  if (weakest) return { kind: 'improve', lesson: weakest.lesson, pct: weakest.pct }

  // 4) Everything practised at 100%
  if (list.some(isPractised)) return { kind: 'mastered' }

  // Only recap-only lessons (no exercises): read the latest one
  return { kind: 'recap', lesson: list[0] }
}
