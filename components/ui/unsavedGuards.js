// Registry behind useUnsavedGuard (components/ui/useUnsavedGuard.js).
//
// Next's router has ONE beforePopState slot and calls every routeChangeStart listener, so
// guards that installed their own handlers overwrote each other (the first cleanup removed
// the back-button protection of a guard still active) and asked twice per link. Here a guard
// only registers itself; one set of listeners, installed while at least one guard is
// registered, asks at most once per navigation, with the message of the most recently
// activated guard that is not bypassed.
//
// Pure: the router (next/router's singleton) and window are injected, for the tests.

export const NAVIGATION_CANCELLED = 'Navigation annulée : modifications non enregistrées.'

/**
 * @typedef {{ message: string, bypass: { current: boolean } }} Guard
 *   `bypass.current = true` skips this guard for a navigation the page triggers itself.
 */

/**
 * @param {{
 *   router: {
 *     asPath: string,
 *     events: { on: Function, off: Function, emit: Function },
 *     beforePopState: (cb: (state: any) => boolean) => void,
 *   },
 *   win: Window,
 * }} deps
 * @returns {{ add: (guard: Guard) => () => void, size: () => number }}
 *   `add` registers an active guard and returns its (idempotent) removal.
 */
export function createGuardRegistry({ router, win }) {
  /** @type {Guard[]} in activation order: the last one speaks */
  const guards = []
  // History entry of the guarded page, pushed back when Back/Forward is cancelled
  let entry = null
  // The user already agreed to leave: nothing asks again until that navigation settles
  let leaving = false

  const blocking = () => guards.filter((guard) => !guard.bypass.current)

  /** @returns {boolean} true when leaving is fine (nothing to protect, or the user said so) */
  const confirmLeave = () => {
    const list = blocking()
    if (list.length === 0) return true
    // eslint-disable-next-line no-alert
    return win.confirm(list[list.length - 1].message)
  }

  const rememberEntry = () => {
    entry = { state: win.history.state, url: win.location.href }
  }

  const onBeforeUnload = (e) => {
    if (leaving || blocking().length === 0) return undefined
    e.preventDefault()
    e.returnValue = ''
    return ''
  }

  const onRouteChangeStart = (url) => {
    if (leaving || url === router.asPath) return
    if (confirmLeave()) {
      leaving = true
      return
    }
    router.events.emit('routeChangeError')
    // Aborts the Next.js navigation (documented workaround: throw a non-Error)
    throw NAVIGATION_CANCELLED
  }

  // Back/forward: Next.js asks beforePopState once the URL has already changed, so on
  // "Cancel" the guarded page's entry is pushed again (right for back AND forward).
  // On "OK", the route change that follows must not ask a second time.
  const onBeforePopState = () => {
    if (leaving || confirmLeave()) {
      leaving = true
      return true
    }
    win.history.pushState(entry.state, '', entry.url)
    return false
  }

  // Still on a guarded page after a navigation (same page, other URL): guard it again
  const onArrived = () => {
    leaving = false
    rememberEntry()
  }
  // Refused or failed: the page stays, so does its protection. A navigation cancelled by the
  // next one (err.cancelled) is not: the user is still on the way out.
  const onAborted = (err) => {
    if (err && err.cancelled) return
    leaving = false
  }

  const install = () => {
    leaving = false
    rememberEntry()
    router.beforePopState(onBeforePopState)
    router.events.on('routeChangeStart', onRouteChangeStart)
    router.events.on('routeChangeComplete', onArrived)
    router.events.on('hashChangeComplete', onArrived)
    router.events.on('routeChangeError', onAborted)
    win.addEventListener('beforeunload', onBeforeUnload)
  }

  const uninstall = () => {
    win.removeEventListener('beforeunload', onBeforeUnload)
    router.events.off('routeChangeStart', onRouteChangeStart)
    router.events.off('routeChangeComplete', onArrived)
    router.events.off('hashChangeComplete', onArrived)
    router.events.off('routeChangeError', onAborted)
    router.beforePopState(() => true)
    leaving = false
    entry = null
  }

  const add = (guard) => {
    guards.push(guard)
    if (guards.length === 1) install()
    let removed = false
    return () => {
      if (removed) return
      removed = true
      const index = guards.indexOf(guard)
      if (index !== -1) guards.splice(index, 1)
      if (guards.length === 0) uninstall()
    }
  }

  return { add, size: () => guards.length }
}
