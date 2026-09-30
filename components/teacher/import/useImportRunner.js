// Import queue runner: two documents at a time, each one sent to
// POST /api/teacher/lessons/import (202 + lesson id, generation runs on the server),
// then polled every 4 s (GET …?light=1) until the lesson is published or failed.
//
// Retries are safe: a row keeps its clientKey, so sending it again returns the
// lesson already created (200 duplicate) instead of a second one; a lesson that
// exists but failed is regenerated.
import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from '@/utils/apiClient'
import { isAbortError } from '@/components/teacher/format'
import { frenchError } from '@/components/teacher/import/importUtils'
import { ACTIVE_RUNS, rowTitle, sourceNameFor } from '@/components/teacher/import/rows'

export const RUN_CONCURRENCY = 2
const POLL_MS = 4000
const MAX_POLL_MS = 30_000
const SEND_RETRY_DELAYS = [2000, 5000] // network drop / server error: the clientKey makes it safe
const TROUBLE_AFTER = 3 // failed polls in a row before telling the teacher

const STALE_MESSAGE = 'La génération semble bloquée (plus de 5 minutes). « Réessayer » la relance.'
const GONE_MESSAGE = 'Leçon introuvable : elle a peut-être été supprimée.'

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

const retriable = (err) => err instanceof ApiError && (err.status === 0 || err.status >= 500)

async function withRetry(request, signal) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await request()
    } catch (err) {
      if (!retriable(err) || attempt >= SEND_RETRY_DELAYS.length) throw err
      await wait(SEND_RETRY_DELAYS[attempt], signal)
    }
  }
}

/**
 * @param {{ rows: object[], rowsRef: { current: object[] }, setRows: Function,
 *   patchRow: (key: string, patch: object) => void, mounted: { current: boolean } }} deps
 * @returns {{ start: (keys: string[], config: RunConfig) => void, stop: () => void,
 *   stopRequested: boolean, paused: string | null, clearPaused: () => void }}
 *   RunConfig = { studentId, student, options, publish } (fixed while the queue runs);
 *   `paused`: error message when the queue paused itself (same error twice in a row)
 */
export default function useImportRunner({ rows, rowsRef, setRows, patchRow, mounted }) {
  const jobs = useRef(new Map()) // row key → AbortController
  const config = useRef(null)
  const seq = useRef(0)
  const streak = useRef({ message: null, count: 0 })
  const [stopRequested, setStopRequested] = useState(false)
  const [paused, setPaused] = useState(null)

  // Abort every request on unmount (lessons already sent keep generating server-side)
  useEffect(() => {
    const active = jobs.current
    return () => {
      active.forEach((c) => c.abort())
      active.clear()
    }
  }, [])

  const dequeue = useCallback(() => {
    setRows((rs) => rs.map((r) => (r.run === 'queued' ? { ...r, run: r.lessonId || r.runError ? 'failed' : 'idle' } : r)))
  }, [setRows])

  // Same error twice in a row (AI credit, invalid key, network down…): stop
  // launching documents instead of failing the whole batch one by one.
  const noteOutcome = useCallback(
    (errorMessage) => {
      const s = streak.current
      if (!errorMessage) {
        streak.current = { message: null, count: 0 }
        return
      }
      streak.current = { message: errorMessage, count: s.message === errorMessage ? s.count + 1 : 1 }
      if (streak.current.count >= 2 && rowsRef.current.some((r) => r.run === 'queued')) {
        dequeue()
        setPaused(errorMessage)
      }
    },
    [dequeue, rowsRef]
  )

  const fail = useCallback(
    (key, message, patch = {}) => {
      patchRow(key, { run: 'failed', runError: message, ...patch })
      noteOutcome(message)
    },
    [noteOutcome, patchRow]
  )

  const regenerate = useCallback(async (lessonId, signal) => {
    try {
      const res = await withRetry(
        () =>
          api(`/api/teacher/lessons/${lessonId}/regenerate`, {
            method: 'POST',
            body: { options: config.current.options },
            signal,
          }),
        signal
      )
      return res?.lesson || { id: lessonId, status: 'generating' }
    } catch (err) {
      // Already generating (e.g. a lost answer to a previous attempt): just follow it
      if (err instanceof ApiError && err.status === 409 && err.code === 'busy') return { id: lessonId, status: 'generating' }
      throw err
    }
  }, [])

  const send = useCallback(
    async (row, signal) => {
      if (row.lessonId) return regenerate(row.lessonId, signal)
      const { studentId, student, options, publish } = config.current
      const title = rowTitle(row, student).trim()
      const body = {
        studentId,
        lessonDate: row.lessonDate,
        sourceName: sourceNameFor(row),
        text: row.text.trim(),
        options,
        clientKey: row.clientKey,
        publish,
      }
      if (title) body.title = title
      patchRow(row.key, { sent: true })
      let res
      try {
        res = await withRetry(() => api('/api/teacher/lessons/import', { method: 'POST', body, signal }), signal)
      } catch (err) {
        // Refused (validation, unknown student): nothing was created by this attempt
        if (err instanceof ApiError && err.status >= 400 && err.status < 500) patchRow(row.key, { sent: row.sent })
        throw err
      }
      const lesson = res?.lesson
      if (!lesson?.id) throw new ApiError('Réponse inattendue du serveur.', 500)
      if (res.duplicate) {
        // Created by an earlier attempt whose answer was lost, and that generation failed
        if (lesson.status === 'failed') return regenerate(lesson.id, signal)
        // Its draft flag and title may differ from this attempt: read them from the lesson
        return { id: lesson.id, status: 'generating', recheck: true }
      }
      // A new lesson is a draft when the teacher chose to review it first
      return { hidden: !publish, ...lesson }
    },
    [patchRow, regenerate]
  )

  const poll = useCallback(
    async (key, lessonId, signal, firstDelay) => {
      let delay = firstDelay
      let trouble = 0
      for (;;) {
        await wait(delay, signal)
        let lesson
        try {
          // Light variant: status fields only, not the 150 000-character document every 4 s
          lesson = (await api(`/api/teacher/lessons/${lessonId}?light=1`, { signal }))?.lesson
        } catch (err) {
          if (isAbortError(err)) throw err
          if (err instanceof ApiError && err.status === 404) {
            // Deleted meanwhile: a new attempt sends the document again
            fail(key, GONE_MESSAGE, { lessonId: null, sent: false })
            return
          }
          trouble += 1
          if (trouble === TROUBLE_AFTER) patchRow(key, { pollTrouble: true })
          delay = Math.min(POLL_MS * 2 ** Math.min(trouble, 3), MAX_POLL_MS)
          continue
        }
        if (trouble) patchRow(key, { pollTrouble: false })
        trouble = 0
        delay = POLL_MS
        if (!lesson) continue
        const shown = lesson.title ? { title: lesson.title } : {}
        if (lesson.status === 'published') {
          patchRow(key, { run: 'published', runError: null, hidden: Boolean(lesson.hidden), stale: false, ...shown })
          noteOutcome(null)
          return
        }
        if (lesson.status === 'failed') {
          fail(key, lesson.error || 'La génération a échoué.', { hidden: Boolean(lesson.hidden), stale: false })
          return
        }
        if (lesson.stale) {
          fail(key, STALE_MESSAGE, { stale: true })
          return
        }
      }
    },
    [fail, noteOutcome, patchRow]
  )

  const runJob = useCallback(
    async (row, mode) => {
      const controller = new AbortController()
      jobs.current.set(row.key, controller)
      const { signal } = controller
      try {
        let lessonId = row.lessonId
        let firstDelay = mode === 'send' ? POLL_MS : 0
        if (mode === 'send') {
          patchRow(row.key, { run: 'sending', runError: null, stale: false, pollTrouble: false, startedAt: Date.now() })
          const lesson = await send(row, signal)
          if (!mounted.current) return
          lessonId = lesson.id
          if (lesson.status === 'published') {
            patchRow(row.key, { run: 'published', lessonId, hidden: Boolean(lesson.hidden), runError: null })
            noteOutcome(null)
            return
          }
          if (lesson.status === 'failed') {
            fail(row.key, lesson.error || 'La génération a échoué.', { lessonId })
            return
          }
          patchRow(row.key, { run: 'generating', lessonId })
          if (lesson.recheck) firstDelay = 0
        }
        // Restored after a reload (or a duplicate): the lesson may be done already, check right away
        await poll(row.key, lessonId, signal, firstDelay)
      } catch (err) {
        if (isAbortError(err) || !mounted.current) return
        fail(row.key, frenchError(err, "L'envoi a échoué."))
      } finally {
        if (jobs.current.get(row.key) === controller) jobs.current.delete(row.key)
      }
    },
    [fail, mounted, noteOutcome, patchRow, poll, send]
  )

  // Scheduler: follow lessons generating on the server, then fill the free slots
  // with queued rows in queue order.
  useEffect(() => {
    const active = jobs.current
    rows.forEach((r) => {
      if (r.run === 'generating' && r.lessonId && !active.has(r.key)) runJob(r, 'poll')
    })
    let busy = rows.filter((r) => r.run === 'sending' || r.run === 'generating').length
    if (busy >= RUN_CONCURRENCY || !config.current) return
    rows
      .filter((r) => r.run === 'queued' && !active.has(r.key))
      .sort((a, b) => a.queueSeq - b.queueSeq)
      .forEach((r) => {
        if (busy >= RUN_CONCURRENCY) return
        busy += 1
        runJob(r, 'send')
      })
  }, [rows, runJob])

  const running = rows.some((r) => ACTIVE_RUNS.has(r.run))
  useEffect(() => {
    if (!running) setStopRequested(false)
  }, [running])

  /** Queues rows (in the given order) with the settings of this run. */
  const start = useCallback(
    (keys, runConfig) => {
      if (!keys.length) return
      config.current = runConfig
      streak.current = { message: null, count: 0 }
      setPaused(null)
      setStopRequested(false)
      const order = new Map(keys.map((k) => [k, (seq.current += 1)]))
      setRows((rs) =>
        rs.map((r) => (order.has(r.key) ? { ...r, run: 'queued', queueSeq: order.get(r.key), showText: false } : r))
      )
    },
    [setRows]
  )

  /** Stops launching documents; the ones already sent finish on the server. */
  const stop = useCallback(() => {
    setStopRequested(true)
    dequeue()
  }, [dequeue])

  const clearPaused = useCallback(() => setPaused(null), [])

  return { start, stop, stopRequested, paused, clearPaused }
}
