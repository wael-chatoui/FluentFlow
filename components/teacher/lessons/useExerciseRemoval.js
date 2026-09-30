import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/utils/apiClient'
import { useBeforeUnload, useMountedRef } from '@/components/teacher/hooks'

export const UNDO_MS = 6000

/**
 * Exercise removal with an undo window: removed exercises disappear right away, and
 * the PATCH { removeExerciseIds } is only sent once the "Annuler" toast has expired
 * (or when the page is left). A failed request brings the exercises back.
 * @param {string} lessonId
 * @param {{ onCommitted: (lesson: object) => void, onError: (message: string) => void }} handlers
 * @returns {{ hiddenIds: Set<string>, pendingCount: number, remove: (id: string) => void,
 *   undo: () => void, flush: () => void }}
 */
export default function useExerciseRemoval(lessonId, { onCommitted, onError }) {
  const mounted = useMountedRef()
  const [pending, setPending] = useState([]) // removed locally, still undoable
  const [sending, setSending] = useState([]) // PATCH in flight
  const pendingRef = useRef(pending)
  pendingRef.current = pending
  const timer = useRef(null)
  const handlers = useRef({ onCommitted, onError })
  handlers.current = { onCommitted, onError }

  // Not aborted on unmount on purpose: leaving the page must still apply the removal
  const commit = useCallback(
    (ids) => {
      if (!ids.length) return
      if (mounted.current) setSending((prev) => [...prev, ...ids])
      api(`/api/teacher/lessons/${lessonId}`, { method: 'PATCH', body: { removeExerciseIds: ids } })
        .then((res) => {
          if (mounted.current && res?.lesson) handlers.current.onCommitted(res.lesson)
        })
        .catch((err) => {
          if (mounted.current) handlers.current.onError(err.message || "L'exercice n'a pas pu être supprimé.")
        })
        .finally(() => {
          if (mounted.current) setSending((prev) => prev.filter((id) => !ids.includes(id)))
        })
    },
    [lessonId, mounted]
  )

  const flush = useCallback(() => {
    clearTimeout(timer.current)
    const ids = pendingRef.current
    pendingRef.current = []
    setPending([])
    commit(ids)
  }, [commit])

  const remove = useCallback(
    (id) => {
      setPending((prev) => (prev.includes(id) ? prev : [...prev, id]))
      clearTimeout(timer.current)
      timer.current = setTimeout(flush, UNDO_MS)
    },
    [flush]
  )

  const undo = useCallback(() => {
    clearTimeout(timer.current)
    setPending([])
  }, [])

  // Leaving the page (in-app navigation) sends what is still pending
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      if (pendingRef.current.length) commit(pendingRef.current)
    },
    [commit]
  )

  // Closing the tab cannot send it reliably: ask first
  useBeforeUnload(pending.length > 0)

  return {
    hiddenIds: new Set([...pending, ...sending]),
    pendingCount: pending.length,
    remove,
    undo,
    flush,
  }
}
