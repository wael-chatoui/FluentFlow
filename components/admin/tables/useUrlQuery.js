import { useCallback, useMemo } from 'react'
import { useRouter } from 'next/router'

/**
 * List-page state kept in the URL (shareable, survives reloads and "back").
 * Values are strings; keys equal to their default are dropped from the URL.
 *
 * @param {Record<string, string>} defaults  e.g. { q: '', status: '', page: '1' }
 * @param {string[]} [keep]  route params to keep untouched (e.g. ['table'] for /admin/tables/[table])
 * @returns {{ ready: boolean, params: Record<string, string>, setParams: (patch: Record<string, string|number|null>) => void }}
 */
export default function useUrlQuery(defaults, keep = []) {
  const router = useRouter()
  const ready = router.isReady
  const defaultsKey = JSON.stringify(defaults)
  const keepKey = keep.join(',')

  const params = useMemo(() => {
    const base = JSON.parse(defaultsKey)
    const out = { ...base }
    Object.keys(base).forEach((key) => {
      const raw = router.query[key]
      const value = Array.isArray(raw) ? raw[0] : raw
      if (typeof value === 'string') out[key] = value
    })
    return out
  }, [router.query, defaultsKey])

  const setParams = useCallback(
    (patch) => {
      const base = JSON.parse(defaultsKey)
      const next = { ...params, ...patch }
      const query = {}
      keepKey.split(',').filter(Boolean).forEach((key) => {
        if (router.query[key] !== undefined) query[key] = router.query[key]
      })
      Object.entries(next).forEach(([key, value]) => {
        const v = value === null || value === undefined ? '' : String(value)
        if (v !== (base[key] ?? '')) query[key] = v
      })
      router.replace({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false })
    },
    [params, router, defaultsKey, keepKey]
  )

  return { ready, params, setParams }
}

/** Builds '?a=1&b=x' from an object, skipping empty values. */
export function toQueryString(values) {
  const qs = new URLSearchParams()
  Object.entries(values).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) qs.set(key, String(value))
  })
  const s = qs.toString()
  return s ? `?${s}` : ''
}

/** Positive integer page from a URL string (1 on garbage). */
export function toPage(value) {
  const n = Number.parseInt(value, 10)
  return Number.isFinite(n) && n > 0 ? n : 1
}
