import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/utils/apiClient'
import { isAbortError } from '@/components/teacher/format'

/** Ref that is true while the component is mounted (guards setState after async work). */
export function useMountedRef() {
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return mounted
}

/** Shows the browser's "leave page?" prompt while `active` is true. */
export function useBeforeUnload(active) {
  useEffect(() => {
    if (!active) return undefined
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [active])
}

/** Seconds elapsed since `startedAt` (ms timestamp), ticking every second; 0 when null. */
export function useElapsedSeconds(startedAt) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!startedAt) return undefined
    setNow(Date.now())
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [startedAt])
  return startedAt ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0
}

/**
 * GET `path` with api() when it changes (null = idle); aborted on change and unmount.
 * - `reload()` shows the loading state again and reports errors in `error` / `notFound`;
 * - `refresh()` keeps the current data and throws on failure (used by polling).
 * @returns {{ data: any, error: string|null, notFound: boolean, loading: boolean,
 *   reload: () => Promise<any>, refresh: () => Promise<any>, setData: (updater: any) => void }}
 */
export function useApiResource(path, { errorMessage = 'Impossible de charger les données.' } = {}) {
  const mounted = useMountedRef()
  const controllerRef = useRef(null)
  const [state, setState] = useState({ data: null, error: null, notFound: false })

  const request = useCallback(
    async (silent) => {
      if (!path) return null
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      if (!silent) setState({ data: null, error: null, notFound: false })
      try {
        const data = await api(path, { signal: controller.signal })
        if (!mounted.current || controller.signal.aborted) return null
        setState({ data, error: null, notFound: false })
        return data
      } catch (err) {
        if (isAbortError(err) || !mounted.current || controller.signal.aborted) return null
        if (err.status === 404) {
          setState({ data: null, error: null, notFound: true })
          return null
        }
        if (silent) throw err
        setState({ data: null, error: err.message || errorMessage, notFound: false })
        return null
      }
    },
    [path, mounted, errorMessage]
  )

  const reload = useCallback(() => request(false), [request])
  const refresh = useCallback(() => request(true), [request])

  useEffect(() => {
    reload()
    return () => controllerRef.current?.abort()
  }, [reload])

  const setData = useCallback((updater) => {
    setState((s) => ({ ...s, data: typeof updater === 'function' ? updater(s.data) : updater }))
  }, [])

  return {
    data: state.data,
    error: state.error,
    notFound: state.notFound,
    loading: Boolean(path) && !state.data && !state.error && !state.notFound,
    reload,
    refresh,
    setData,
  }
}

/**
 * Calls `tick(signal)` every `interval` ms while `active` (first call after one interval).
 * Paused while the tab is hidden, with one call as soon as it is visible again.
 * A rejected tick is retried after `retryInterval`; `signal` aborts when polling stops.
 */
export function usePolling(active, tick, { interval = 4000, retryInterval = 8000 } = {}) {
  const tickRef = useRef(tick)
  tickRef.current = tick

  useEffect(() => {
    if (!active) return undefined
    const controller = new AbortController()
    let stopped = false
    let running = false
    let timer = null

    const schedule = (ms) => {
      clearTimeout(timer)
      timer = setTimeout(run, ms)
    }
    async function run() {
      if (stopped || running || document.hidden) return
      running = true
      try {
        await tickRef.current(controller.signal)
        if (!stopped) schedule(interval)
      } catch (err) {
        if (!stopped && !isAbortError(err)) schedule(retryInterval)
      } finally {
        running = false
      }
    }
    const onVisibility = () => {
      if (!document.hidden) schedule(0)
    }

    document.addEventListener('visibilitychange', onVisibility)
    schedule(interval)
    return () => {
      stopped = true
      controller.abort()
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [active, interval, retryInterval])
}
