// Tiny client cache for the student API reads that several pages share (/api/me,
// /api/student/lessons). A page shows what is cached at once and refreshes it in the
// background; the shell reads the same data (name, mistake count) without refetching
// on every page. Everything cached belongs to the signed-in user and is dropped as
// soon as another user (or nobody) is signed in.
import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { api } from '@/utils/apiClient'

const entries = new Map() // key → { data, at }
const inflight = new Map() // key → { promise, change } (one request per key at a time)
const changes = new Map() // key → counter bumped by local patches / invalidations
const listeners = new Set()
let owner // user id the cache belongs to; undefined until known
let signingOut = false // this tab started the sign-out (markSigningOut)
let leaving = false // already sent to /login

function notify() {
  listeners.forEach((listener) => listener())
}

function claim(userId) {
  if (owner === userId) return
  owner = userId
  entries.clear()
  inflight.clear()
  if (userId) signingOut = false // signed in again (client-side, after a sign-out in this tab)
}

/**
 * Call right before this tab signs out (Sign out, account deleted) and navigates away by
 * itself: the student pages then just stop fetching instead of sending the tab to /login.
 */
export function markSigningOut() {
  signingOut = true
}

// Signed out somewhere else (another tab, or another device: sign-out is global): nothing on
// this page works anymore and no request will 401, so go to /login, back here after sign-in.
function toLogin() {
  if (leaving || typeof window === 'undefined') return
  leaving = true
  const here = `${window.location.pathname}${window.location.search}`
  window.location.replace(`/login?next=${encodeURIComponent(here)}`)
}

const changeOf = (key) => changes.get(key) || 0
const bump = (key) => changes.set(key, changeOf(key) + 1)

function load(key, path, keep) {
  const change = changeOf(key)
  const pending = inflight.get(key)
  if (pending && pending.change === change) return pending.promise
  const userId = owner
  const promise = api(path).then((data) => {
    // A response started before a local patch (e.g. a saved practice run) is older than it
    if (owner === userId && changeOf(key) === change) {
      if (!keep || keep(data)) entries.set(key, { data, at: Date.now() })
      else entries.delete(key)
      notify()
    }
    return data
  })
  inflight.set(key, { promise, change })
  const done = () => {
    if (inflight.get(key)?.promise === promise) inflight.delete(key)
  }
  promise.then(done, done)
  return promise
}

/** Replaces cached data without a request (no-op when nothing is cached). */
export function patchCache(key, update) {
  const entry = entries.get(key)
  if (!entry) return
  bump(key)
  entries.set(key, { ...entry, data: update(entry.data) })
  notify()
}

/** Marks cached data as stale: the next reader refetches it (still showing it meanwhile). */
export function invalidateCache(key) {
  bump(key)
  const entry = entries.get(key)
  if (entry) entries.set(key, { ...entry, at: 0 })
}

/**
 * GET `path` through the cache.
 * @param {string} key
 * @param {string} path
 * @param {{ maxAge?: number, keep?: (data: any) => boolean }} [options]
 *   maxAge: ms during which cached data is used without a request (0 = show it, but refresh);
 *   keep: whether a response may be cached (default: always)
 * @returns {{ data: any, error: Error|null, loading: boolean, reload: () => void }}
 *   data stays available (possibly stale) when a background refresh fails
 */
export function useCachedApi(key, path, { maxAge = 0, keep } = {}) {
  const { user, loading: authLoading } = useAuth()
  const userId = authLoading ? undefined : user?.id ?? null
  const [, rerender] = useReducer((n) => n + 1, 0)
  const [own, setOwn] = useState({ userId: undefined, data: undefined, error: null }) // this hook's last answer
  const [reloadKey, setReloadKey] = useState(0)
  const keepRef = useRef(keep)
  keepRef.current = keep

  useEffect(() => {
    listeners.add(rerender)
    return () => {
      listeners.delete(rerender)
    }
  }, [])

  useEffect(() => {
    if (userId === undefined) return undefined
    // Signed out during this visit: asking the API now would only 401. When this tab signed
    // out by itself (Sign out, account deleted), it is already on its way to /login.
    // Otherwise (another tab, another device, or a 401 whose redirect goes to the same
    // place) nothing else would move this page, so go there. (A first load without a
    // session still asks: the server decides, and its 401 leads to /login.)
    if (userId === null && owner !== undefined) {
      claim(null)
      if (!signingOut) toLogin()
      return undefined
    }
    claim(userId)
    const entry = entries.get(key)
    if (reloadKey === 0 && entry && Date.now() - entry.at < maxAge) return undefined
    let active = true
    load(key, path, keepRef.current).then(
      (data) => active && setOwn({ userId, data, error: null }),
      (error) => active && setOwn((s) => ({ userId, data: s.userId === userId ? s.data : undefined, error }))
    )
    return () => {
      active = false
    }
  }, [key, path, maxAge, userId, reloadKey])

  const reload = useCallback(() => {
    setOwn((s) => ({ ...s, error: null }))
    setReloadKey((k) => k + 1)
  }, [])

  // The shared entry wins (other readers and patches keep it fresh); `own` covers
  // responses that are not cached (keep() said no)
  const cached = userId !== undefined && owner === userId ? entries.get(key)?.data : undefined
  const mine = own.userId === userId ? own : { data: undefined, error: null }
  const data = cached !== undefined ? cached : mine.data
  return { data, error: mine.error, loading: data === undefined && !mine.error, reload }
}
