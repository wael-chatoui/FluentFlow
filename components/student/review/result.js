// Result of a review round (POST /api/student/review), shared by the player's end
// screen and the intro banner.
import { plural } from '@/components/lesson/format'

/**
 * POST response → { score?, total?, remaining, skipped }. When every answer was skipped
 * (lesson updated or removed meanwhile) the server graded nothing: no score then, so the
 * player keeps showing the round the student just played instead of 0/0.
 */
export function reviewResult(res) {
  const total = Number(res?.total)
  const skipped = Number(res?.skipped) || 0
  const graded = total > 0 || skipped === 0
  return {
    ...(graded ? { score: Number(res?.score), total } : {}),
    remaining: Number(res?.remaining),
    skipped,
  }
}

/** End screen text once the round is saved. */
export function reviewSavedText(result) {
  const n = Number(result?.remaining)
  const skipped = Number(result?.skipped) || 0
  const note = skipped > 0 ? ` · ${plural(skipped, 'answer')} skipped (lesson updated or removed)` : ''
  if (!Number.isFinite(n)) return `Progress saved${note}`
  if (n === 0) return `Saved · No mistakes left!${note}`
  return `Saved · ${plural(n, 'mistake')} left to fix${note}`
}
