import { useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/components/AuthProvider'
import { api } from '@/utils/apiClient'

/**
 * Root page — routes based on auth state:
 * - not logged in → /login
 * - teacher (app_metadata.role) → /teacher
 * - student → /student if onboarded (GET /api/me), else /onboarding
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

  return (
    <div className="loading-screen" role="status">
      <div className="spinner spinner-lg" aria-hidden="true" />
      <span className="sr-only">Loading…</span>
    </div>
  )
}
