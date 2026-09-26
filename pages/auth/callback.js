import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { createClient } from '@/utils/supabase/client'
import { api } from '@/utils/apiClient'

const TIMEOUT_MS = 10000

/**
 * OAuth / email-link callback. supabase-js exchanges the code (PKCE) or reads the
 * hash (implicit flow) on its own; we wait for the session, then route:
 * teacher → /teacher, student → /student or /onboarding (GET /api/me).
 * Never hangs: falls back to /login after a timeout.
 */
export default function AuthCallbackPage() {
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router
  const [failed, setFailed] = useState('')

  useEffect(() => {
    const supabase = createClient()
    const controller = new AbortController()
    let finished = false
    let routing = false
    let subscription = null
    let timer = null

    const cleanup = () => {
      clearTimeout(timer)
      subscription?.unsubscribe()
      subscription = null
    }

    const navigate = (path) => {
      if (finished) return
      finished = true
      cleanup()
      routerRef.current.replace(path)
    }

    const routeUser = async (user) => {
      if (routing || finished) return
      routing = true
      subscription?.unsubscribe()
      subscription = null
      if (user.app_metadata?.role === 'teacher') {
        navigate('/teacher')
        return
      }
      try {
        const me = await api('/api/me', { signal: controller.signal })
        if (me?.role === 'teacher') navigate('/teacher')
        else navigate(me?.profile?.onboarded_at ? '/student' : '/onboarding')
      } catch (err) {
        if (err?.name === 'AbortError') return
        navigate('/student')
      }
    }

    // Provider error in the URL (e.g. user cancelled Google sign-in)
    const params = new URLSearchParams(window.location.search + window.location.hash.replace(/^#/, '&'))
    const urlError = params.get('error_description') || params.get('error')
    if (urlError) {
      setFailed(urlError)
      timer = setTimeout(() => navigate('/login'), 4000)
      return () => {
        finished = true
        cleanup()
        controller.abort()
      }
    }

    timer = setTimeout(() => navigate('/login'), TIMEOUT_MS)

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) routeUser(session.user)
    })
    subscription = data?.subscription ?? null

    supabase.auth
      .getSession()
      .then(({ data: { session }, error }) => {
        if (finished) return
        if (error) {
          navigate('/login')
          return
        }
        if (session?.user) routeUser(session.user)
      })
      .catch(() => navigate('/login'))

    return () => {
      finished = true
      cleanup()
      controller.abort()
    }
  }, [])

  return (
    <div className="auth-callback" role="status">
      {failed ? (
        <>
          <p>Sign-in didn&apos;t complete: {failed}</p>
          <Link href="/login" className="btn btn-primary" style={{ minHeight: 44 }}>
            Back to sign in
          </Link>
        </>
      ) : (
        <>
          <div className="spinner spinner-lg" aria-hidden="true" />
          <p>Signing you in…</p>
        </>
      )}
    </div>
  )
}
