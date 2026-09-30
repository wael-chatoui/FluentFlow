// The student's lesson list (GET /api/student/lessons) through the shared cache:
// Home and My lessons show it at once and refresh it; the shell reads mistakeCount
// for the Review tab badge. Practice and review saves patch it so every page is
// up to date without waiting for a refetch.
import { invalidateCache, patchCache, useCachedApi } from '@/components/student/cache'

const KEY = 'lessons'

/**
 * @param {{ maxAge?: number }} [options]  0 (default) = show the cached list, refresh in the background
 * @returns {{ data: { driveFolderUrl, mistakeCount, wordCount, lessons: object[] } | undefined,
 *   error: Error|null, loading: boolean, reload: () => void }}
 */
export default function useLessons({ maxAge = 0 } = {}) {
  return useCachedApi(KEY, '/api/student/lessons', { maxAge })
}

/**
 * A practice run was saved (POST …/practice result): show the new best score on the
 * cached lesson now; mistakes and the rest are refetched by the next reader.
 */
export function recordPractice(lessonId, result) {
  patchCache(KEY, (data) => ({
    ...data,
    lessons: (data?.lessons || []).map((l) =>
      l.id === lessonId
        ? {
            ...l,
            best_score: Number.isFinite(result?.bestScore) ? result.bestScore : l.best_score,
            best_total: Number.isFinite(result?.bestTotal) ? result.bestTotal : l.best_total,
            attempts: (Number(l.attempts) || 0) + (result?.duplicate ? 0 : 1),
            last_practiced_at: new Date().toISOString(),
            updated_since_practice: false,
          }
        : l
    ),
  }))
  invalidateCache(KEY)
}

/** Mistakes left after a review round (POST /api/student/review `remaining`, GET `total`). */
export function setMistakeCount(count) {
  if (!Number.isFinite(count) || count < 0) return
  patchCache(KEY, (data) => ({ ...data, mistakeCount: count }))
}

/** Something changed server-side (e.g. the lesson was updated): refetch on next read. */
export function invalidateLessons() {
  invalidateCache(KEY)
}
