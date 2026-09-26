import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { useAuth } from '@/components/AuthProvider'
import { createClient } from '@/utils/supabase/client'

const APPEARANCE = {
  theme: ThemeSupa,
  variables: {
    default: {
      colors: {
        brand: '#FF69B4',
        brandAccent: '#E0559E',
        inputBackground: 'white',
        inputBorder: '#e5e7eb',
        inputBorderHover: '#FF69B4',
        inputBorderFocus: '#FF69B4',
      },
      borderWidths: {
        buttonBorderWidth: '0px',
        inputBorderWidth: '1.5px',
      },
      radii: {
        borderRadiusButton: '10px',
        buttonBorderRadius: '10px',
        inputBorderRadius: '10px',
      },
      fontSizes: {
        baseBodySize: '14px',
        baseInputSize: '16px', // ≥ 16px: no zoom-on-focus on iOS
        baseLabelSize: '14px',
        baseButtonSize: '15px',
      },
      fonts: {
        bodyFontFamily: "'Inter', sans-serif",
        buttonFontFamily: "'Inter', sans-serif",
        inputFontFamily: "'Inter', sans-serif",
        labelFontFamily: "'Inter', sans-serif",
      },
    },
  },
}

const LOCALIZATION = {
  variables: {
    sign_in: {
      email_label: 'Email address',
      password_label: 'Password',
      email_input_placeholder: 'you@example.com',
      password_input_placeholder: 'Your password',
      button_label: 'Sign in',
      loading_button_label: 'Signing in…',
      social_provider_text: 'Continue with {{provider}}',
      link_text: 'Already have an account? Sign in',
    },
    sign_up: {
      email_label: 'Email address',
      password_label: 'Create a password',
      email_input_placeholder: 'you@example.com',
      password_input_placeholder: 'At least 6 characters',
      button_label: 'Sign up',
      loading_button_label: 'Creating your account…',
      social_provider_text: 'Continue with {{provider}}',
      link_text: "Don't have an account? Sign up",
      confirmation_text: 'Check your email for the confirmation link',
    },
    forgotten_password: {
      email_label: 'Email address',
      email_input_placeholder: 'you@example.com',
      button_label: 'Send reset instructions',
      loading_button_label: 'Sending…',
      link_text: 'Forgot your password?',
      confirmation_text: 'Check your email for the password reset link',
    },
  },
}

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

  if (loading || user) {
    return (
      <div className="loading-screen" role="status">
        <div className="spinner spinner-lg" aria-hidden="true" />
        <span className="sr-only">Loading…</span>
      </div>
    )
  }

  return (
    <div className="auth-page">
      <Head>
        <title>Sign in · Preply Lessons</title>
      </Head>
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-icon" aria-hidden="true">🇫🇷</div>
            <h1>Preply Lessons</h1>
            <p>Sign in to see your French lessons and practise</p>
          </div>

          <Auth
            supabaseClient={supabase}
            appearance={APPEARANCE}
            providers={['google']}
            redirectTo={redirectTo}
            view="sign_in"
            localization={LOCALIZATION}
          />
        </div>
      </div>
    </div>
  )
}
