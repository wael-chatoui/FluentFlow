import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Auth } from '@supabase/auth-ui-react'
import { useAuth } from '@/components/AuthProvider'
import AuthScreen, { AuthHeader } from '@/components/auth/AuthScreen'
import LoadingScreen from '@/components/ui/LoadingScreen'
import { APPEARANCE, LOCALIZATION } from '@/components/auth/authUi'
import { createClient } from '@/utils/supabase/client'
import formStyles from '@/components/auth/AuthForm.module.css'

export default function LoginPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [supabase] = useState(() => createClient())
  const [redirectTo, setRedirectTo] = useState(undefined)
  const routerRef = useRef(router)
  routerRef.current = router

  // Computed after mount so server and client render the same markup
  useEffect(() => {
    setRedirectTo(`${window.location.origin}/auth/callback`)
  }, [])

  // Already signed in (or just signed in with email/password) → the root page routes by role/onboarding
  useEffect(() => {
    if (!loading && user) routerRef.current.replace('/')
  }, [user, loading])

  // Wait for redirectTo too: without it Supabase falls back to the Site URL (production)
  if (loading || user || !redirectTo) {
    return (
      <>
        <Head>
          <title>Sign in · Preply Lessons</title>
        </Head>
        <LoadingScreen />
      </>
    )
  }

  return (
    <AuthScreen labelledBy="login-title">
      <Head>
        <title>Sign in · Preply Lessons</title>
      </Head>
      <AuthHeader
        id="login-title"
        emoji="🇫🇷"
        title="Preply Lessons"
        subtitle="Sign in to see your French lessons and practise"
      />
      <div className={formStyles.form}>
        <Auth
          supabaseClient={supabase}
          appearance={APPEARANCE}
          providers={['google']}
          redirectTo={redirectTo}
          view="sign_in"
          localization={LOCALIZATION}
        />
      </div>
    </AuthScreen>
  )
}
