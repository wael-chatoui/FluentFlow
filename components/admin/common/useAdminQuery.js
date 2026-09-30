import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/utils/apiClient'

/**
 * GETs an admin API route and tracks { data, error, loading }.
 * - Re-fetches when `url` or any value in `deps` changes; pass `url = null` to skip (e.g. before router.isReady).
 * - Aborts the previous request on change/unmount; AbortError is ignored; no setState after unmount.
 * - `reload()` re-fetches the same url (keeps the previous data visible while loading).
 * - `setData` lets a page apply a server response (e.g. after a PATCH) without re-fetching.
 * - `loading` is already true on the render where `url` changes (before the fetch effect
 *   runs), so `data` is never taken for the new url's answer (e.g. by a "follow the
 *   server's clamped page" effect, which would otherwise bounce back to the old page).
 *
 * @param {string|null} url
 * @param {unknown[]} [deps]
 * @returns {{ data: any, error: string|null, loading: boolean, reload: () => void, setData: Function }}
 */
export default function useAdminQuery(url, deps = []) {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(Boolean(url))
  const [settledUrl, setSettledUrl] = useState(null) // url of the last request that answered
  const [tick, setTick] = useState(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    if (!url) {
      setLoading(false)
      return undefined
    }
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    api(url, { signal: controller.signal })
      .then((result) => {
        if (!mounted.current || controller.signal.aborted) return
        setData(result)
        setSettledUrl(url)
        setLoading(false)
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || !mounted.current || controller.signal.aborted) return
        setError(err?.message || 'Le chargement a échoué.')
        setSettledUrl(url)
        setLoading(false)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, tick, ...deps])

  const reload = useCallback(() => setTick((t) => t + 1), [])

  return { data, error, loading: loading || (Boolean(url) && url !== settledUrl), reload, setData }
}
