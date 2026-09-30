import { useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/components/AuthProvider'
import LoadingScreen from '@/components/ui/LoadingScreen'
import { destinationAfterSignIn, fallbackDestination } from '@/components/auth/afterSignIn'
import { authLandingRedirect } from '@/utils/auth/routing'

/**
 * Root page — sends everyone to the right place (utils/auth/routing.js):
 * not signed in → /login; teacher → /teacher; waiting for approval → /pending;
 * student → /onboarding until onboarded, then /student.
 * Sign-in parameters that Supabase Auth sent here (Site URL fallback) go to /auth/confirm.
 * On a back-office host the proxy already redirects '/' to /admin.
 */
export default function Home() {
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router
  const { user, loading } = useAuth()
  const userRef = useRef(user)
  userRef.current = user
  const userId = user?.id
  const forwardedRef = useRef(false)

  useEffect(() => {
    if (loading || forwardedRef.current) return undefined
    // After loading: supabase-js has run any ?code exchange of its own by then
    const landing = authLandingRedirect(window.location, { signedIn: Boolean(userId) })
    if (landing) {
      // Full load (keeps the #hash); replace() also drops the tokens from the history
      forwardedRef.current = true
      window.location.replace(landing)
      return undefined
    }
    const go = (path) => routerRef.current.replace(path)
    if (!userId) {
      go('/login')
      return undefined
    }

    const controller = new AbortController()
    destinationAfterSignIn({ signal: controller.signal })
      .then((path) => {
        if (!controller.signal.aborted) go(path)
      })
      .catch((err) => {
        // 401: api() is already sending the user to /login
        if (controller.signal.aborted || err?.name === 'AbortError' || err?.status === 401) return
        // Suspended: /login explains it and signs the browser out
        if (err?.code === 'banned') {
          go('/login')
          return
        }
        // Server unreachable: best guess from the session; each area shows its own error state
        go(fallbackDestination(userRef.current))
      })
    return () => controller.abort()
  }, [loading, userId])

  return <LoadingScreen />
}
