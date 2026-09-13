import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@/utils/supabase/client'

/**
 * OAuth callback handler.
 * After Google (or email link) auth, Supabase redirects here with a code in the URL.
 * We exchange it for a session, then redirect to the appropriate dashboard.
 */
export default function AuthCallbackPage() {
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient()

    const handleCallback = async () => {
      // The hash fragment contains the access token for implicit flow,
      // or the query string contains a code for PKCE flow.
      // supabase-js handles both automatically via onAuthStateChange.

      // Wait for the session to be established
      const { data: { session }, error } = await supabase.auth.getSession()

      if (error) {
        console.error('Auth callback error:', error)
        router.replace('/login')
        return
      }

      if (session?.user) {
        const role = session.user.user_metadata?.role
        router.replace(role === 'teacher' ? '/teacher' : '/student')
      } else {
        // Listen for auth state change (for implicit flow)
        const { data: { subscription } } = supabase.auth.onAuthStateChange(
          (event, s) => {
            if (event === 'SIGNED_IN' && s?.user) {
              const r = s.user.user_metadata?.role
              router.replace(r === 'teacher' ? '/teacher' : '/student')
              subscription.unsubscribe()
            }
          }
        )

        // Timeout — if nothing happens in 5s, redirect to login
        setTimeout(() => {
          subscription.unsubscribe()
          router.replace('/login')
        }, 5000)
      }
    }

    handleCallback()
  }, [router])

  return (
    <div className="auth-callback">
      <div className="spinner spinner-lg" />
      <p>Connexion en cours…</p>
    </div>
  )
}
