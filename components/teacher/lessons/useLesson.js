import { useCallback } from 'react'
import { api } from '@/utils/apiClient'
import { useApiResource, usePolling } from '@/components/teacher/hooks'
import { isStaleGeneration, isValidId } from '@/components/teacher/format'

const POLL_MS = 4000
const POLL_RETRY_MS = 8000

function time(iso) {
  const t = Date.parse(iso || '')
  return Number.isFinite(t) ? t : 0
}

/**
 * Teacher lesson page data: GET /api/teacher/lessons/[id]. While the lesson is generating,
 * polls the light variant (?light=1: id, status, error, stale, hidden, title, updated_at)
 * every 4 s, so the transcript / document text is not downloaded again each time, and
 * loads the full lesson once it leaves 'generating' (stops once the API flags it as
 * stale, pauses in hidden tabs).
 * A response older than what is shown (a PATCH answered in between) is ignored.
 * @returns {{ lesson: object|null, sessions: object[], olderCount: number, loading: boolean,
 *   error: string|null, notFound: boolean, reload: () => void, refresh: () => Promise<void>,
 *   applyLesson: (patch: object) => void }}
 *   refresh re-fetches in the background (results after an exercise edit…);
 *   applyLesson merges a lesson returned by PATCH (or a local status change) into the state.
 */
export default function useLesson(id) {
  const path = isValidId(id) ? `/api/teacher/lessons/${id}` : null
  const { data, error, notFound, loading, reload, setData } = useApiResource(path, {
    errorMessage: 'Impossible de charger la leçon.',
  })
  const lesson = data?.lesson || null
  const polling = lesson?.status === 'generating' && !isStaleGeneration(lesson)

  // Background fetch: keeps what is shown on failure; a 404 (deleted meanwhile) reloads into "not found"
  const fetchQuietly = useCallback(
    async (url, signal) => {
      try {
        return await api(url, { signal })
      } catch (err) {
        if (err.status === 404) {
          reload()
          return null
        }
        throw err
      }
    },
    [reload]
  )

  const tick = useCallback(
    async (signal) => {
      const next = await fetchQuietly(path, signal)
      if (!next) return
      setData((prev) => {
        if (prev?.lesson && time(next.lesson?.updated_at) < time(prev.lesson.updated_at)) return prev
        return next
      })
    },
    [path, fetchQuietly, setData]
  )

  // Still generating: merge the status fields; finished (or failed): content, exercises
  // and sessions changed, so the full lesson is loaded
  const poll = useCallback(
    async (signal) => {
      const next = (await fetchQuietly(`${path}?light=1`, signal))?.lesson
      if (!next) return
      if (next.status !== 'generating') {
        await tick(signal)
        return
      }
      setData((prev) => {
        if (!prev?.lesson || time(next.updated_at) < time(prev.lesson.updated_at)) return prev
        return { ...prev, lesson: { ...prev.lesson, ...next } }
      })
    },
    [path, fetchQuietly, tick, setData]
  )

  usePolling(polling, poll, { interval: POLL_MS, retryInterval: POLL_RETRY_MS })

  const refresh = useCallback(() => tick().catch(() => {}), [tick])

  const applyLesson = useCallback(
    (patch) => setData((prev) => (prev ? { ...prev, lesson: { ...prev.lesson, ...patch } } : prev)),
    [setData]
  )

  return {
    lesson,
    sessions: Array.isArray(data?.sessions) ? data.sessions : [],
    olderCount: Number(data?.older_sessions_count ?? data?.lesson?.older_sessions_count) || 0,
    loading,
    error,
    notFound,
    reload,
    refresh,
    applyLesson,
  }
}
