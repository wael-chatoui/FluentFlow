import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/components/AuthProvider'
import { createClient } from '@/utils/supabase/client'
import { clearLinkConfirm } from '@/utils/auth/linkConfirm'
import { destinationAfterSignIn } from '@/components/auth/afterSignIn'
import { failureFromAuthError } from '@/components/auth/failures'

/**
 * Flow of the pages a sign-in lands on (see components/auth/landing.js): read the URL
 * once, establish the session once, then route with GET /api/me + pathAfterSignIn.
 *
 * readParams(): called once on mount → params (must include `next`: a safeNext() value).
 * establish(supabase, params, { force }) → null when signed in,
 *   { failure } (see components/auth/failures.js), { signedInAs: email } to ask
 *   before replacing an existing session, or { confirmAs: email } to have the user
 *   confirm the account a link signed in. Re-run by retry() / continueWithLink().
 *
 * @returns {{ status: 'working'|'failed'|'switch'|'confirm'|'leaving', failure?: string,
 *   email?: string, next: string|null, retry: () => void, continueWithLink: () => void,
 *   stay: () => void, confirm: () => void, notMe: () => void }}
 */
export default function useSignInLanding(readParams, establish) {
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router
  const { signOut } = useAuth()
  const signOutRef = useRef(signOut)
  signOutRef.current = signOut
  const readRef = useRef(readParams)
  const establishFnRef = useRef(establish)
  const paramsRef = useRef(null)
  // Shared in-flight attempt: a one-time token must never be sent twice (e.g. dev StrictMode)
  const attemptRef = useRef(null)
  const signedInRef = useRef(false)
  const sentBackRef = useRef(0)
  const [view, setView] = useState({ status: 'working' })
  const [run, setRun] = useState({ id: 0, force: false })
  // Next.js' hydration step re-applies the original URL (tokens included) to the address
  // bar; the router is ready once it has, so the URL is read and cleaned after that.
  const ready = router.isReady

  useEffect(() => {
    if (!ready) return undefined
    if (!paramsRef.current) paramsRef.current = readRef.current()
    const params = paramsRef.current
    const controller = new AbortController()
    const { signal } = controller

    const go = async () => {
      if (!signedInRef.current) {
        if (!attemptRef.current) {
          attemptRef.current = Promise.resolve()
            .then(() => establishFnRef.current(createClient(), params, { force: run.force }))
            .catch((err) => ({ failure: failureFromAuthError(err) }))
        }
        const outcome = await attemptRef.current
        if (signal.aborted) return
        if (outcome) {
          attemptRef.current = null
          if (outcome.failure) setView({ status: 'failed', failure: outcome.failure })
          else if ('confirmAs' in outcome) setView({ status: 'confirm', email: outcome.confirmAs })
          else setView({ status: 'switch', email: outcome.signedInAs })
          return
        }
        signedInRef.current = true
      }
      const destination = await destinationAfterSignIn({ next: params.next, signal })
      if (signal.aborted) return
      const moved = await routerRef.current.replace(destination).catch(() => false)
      // Still on this page (same component, no remount): the proxy sent the browser back
      // because the account a link signed in is not confirmed yet. Start over from the URL.
      if (signal.aborted || !moved || !/^\/auth\/(confirm|callback)$/.test(window.location.pathname)) return
      sentBackRef.current += 1
      if (sentBackRef.current > 2) {
        setView({ status: 'failed', failure: 'generic' })
        return
      }
      paramsRef.current = readRef.current()
      attemptRef.current = null
      signedInRef.current = false
      setRun((r) => ({ id: r.id + 1, force: false }))
    }

    go().catch(async (err) => {
      // 401: api() is already sending the user to /login
      if (signal.aborted || err?.name === 'AbortError' || err?.status === 401) return
      if (err?.code === 'banned') {
        await signOutRef.current({ scope: 'local' })
        if (!signal.aborted) setView({ status: 'failed', failure: 'banned' })
        return
      }
      setView({ status: 'failed', failure: 'unavailable' })
    })
    return () => controller.abort()
  }, [run, ready])

  const retry = useCallback(() => {
    setView({ status: 'working' })
    setRun((r) => ({ id: r.id + 1, force: r.force }))
  }, [])

  // "Continue with this link": replace the session already open in this browser
  const continueWithLink = useCallback(() => {
    setView({ status: 'working' })
    setRun((r) => ({ id: r.id + 1, force: true }))
  }, [])

  // "Stay signed in as …": keep the current session, leave the link unused
  const stay = useCallback(() => {
    signedInRef.current = true
    setView({ status: 'working' })
    setRun((r) => ({ id: r.id + 1, force: false }))
  }, [])

  // "Continue": the account the link signed in is the user's own
  const confirm = useCallback(() => {
    clearLinkConfirm()
    signedInRef.current = true
    setView({ status: 'working' })
    setRun((r) => ({ id: r.id + 1, force: false }))
  }, [])

  // "That's not me": leave that account on this browser only, back to the sign-in page
  const notMe = useCallback(async () => {
    setView({ status: 'leaving' })
    await signOutRef.current({ scope: 'local' })
    const next = paramsRef.current?.next
    // Full load: nothing of that account's session stays in this page
    window.location.replace(next ? `/login?next=${encodeURIComponent(next)}` : '/login')
  }, [])

  // The page the user was heading to, so "Back to sign in" keeps it
  return { ...view, next: paramsRef.current?.next || null, retry, continueWithLink, stay, confirm, notMe }
}
