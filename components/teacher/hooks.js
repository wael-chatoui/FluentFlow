import { useEffect, useRef, useState } from 'react'

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
