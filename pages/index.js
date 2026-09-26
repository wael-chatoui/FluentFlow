import { useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/components/AuthProvider'
import { api } from '@/utils/apiClient'
import LoadingScreen from '@/components/ui/LoadingScreen'

/**
 * Root page — routes based on auth state:
 * - not logged in → /login
 * - teacher (app_metadata.role) → /teacher
 * - student → /student if onboarded (GET /api/me), else /onboarding
 * - on a backoffice.* host → /admin
 */
export default function Home() {
  const router = useRouter()
  const { user, role, loading } = useAuth()
  const routerRef = useRef(router)
  routerRef.current = router
  const userId = user?.id

  useEffect(() => {
    if (loading) return
    const go = (path) => routerRef.current.replace(path)

    if (!userId) {
      go('/login')
      return
    }
    // On the back-office host, a signed-in user always lands in /admin (the proxy gates it)
    if (window.location.hostname.startsWith('backoffice.')) {
      go('/admin')
      return
    }
    if (role === 'teacher') {
      go('/teacher')
      return
    }

    const controller = new AbortController()
    api('/api/me', { signal: controller.signal })
      .then((me) => {
        if (controller.signal.aborted) return
        if (me?.role === 'teacher') go('/teacher')
        else go(me?.profile?.onboarded_at ? '/student' : '/onboarding')
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || controller.signal.aborted) return
        // /student shows its own error state (and redirects to onboarding if needed)
        go('/student')
      })
    return () => controller.abort()
  }, [loading, userId, role])

  return <LoadingScreen />
}
