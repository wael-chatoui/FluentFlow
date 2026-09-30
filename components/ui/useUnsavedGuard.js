import { useEffect, useRef } from 'react'
import Router from 'next/router'
import { createGuardRegistry } from '@/components/ui/unsavedGuards'

const DEFAULT_MESSAGE = 'Tu as des modifications non enregistrées. Quitter quand même ?'

// One registry for the whole app: Next's router has a single beforePopState slot, so the
// guards of one page (e.g. the student form + the plan being generated) must share it.
// Created on first use, in an effect: client-side only.
let registry = null
const getRegistry = () => {
  if (!registry) registry = createGuardRegistry({ router: Router, win: window })
  return registry
}

/**
 * Warns before leaving the page while `dirty`: browser prompt on reload/close,
 * confirm() on in-app navigation and on the browser back/forward buttons.
 * Several guards can be active on one page: they ask once, with the message of
 * the most recently activated one.
 * Returns a ref: set `.current = true` to skip this guard for a navigation the
 * page triggers itself (e.g. after a delete).
 * @param {boolean} dirty
 * @param {string} [message]  confirm() text (French by default)
 */
export default function useUnsavedGuard(dirty, message = DEFAULT_MESSAGE) {
  const bypass = useRef(false)
  const guard = useRef(null)
  if (guard.current === null) guard.current = { bypass, message }

  // A new message while active (e.g. import: running → unsent) keeps the guard's place
  useEffect(() => {
    guard.current.message = message
  }, [message])

  useEffect(() => (dirty ? getRegistry().add(guard.current) : undefined), [dirty])

  return bypass
}
