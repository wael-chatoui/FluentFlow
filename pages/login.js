import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { Auth } from '@supabase/auth-ui-react'
import { ThemeSupa } from '@supabase/auth-ui-shared'
import { useAuth } from '@/components/AuthProvider'
import { createClient } from '@/utils/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const { user, role, loading } = useAuth()
  const supabase = createClient()

  // Redirect if already logged in
  useEffect(() => {
    if (!loading && user) {
      const target = role === 'teacher' ? '/teacher' : '/student'
      router.replace(target)
    }
  }, [user, role, loading, router])

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner-lg" />
      </div>
    )
  }

  if (user) return null // Will redirect

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-icon">🇫🇷</div>
            <h1>Preply Lessons</h1>
            <p>Connecte-toi pour accéder à tes cours</p>
          </div>

          <Auth
            supabaseClient={supabase}
            appearance={{
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
                    baseInputSize: '15px',
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
            }}
            providers={['google']}
            redirectTo={
              typeof window !== 'undefined'
                ? `${window.location.origin}/auth/callback`
                : `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/auth/callback`
            }
            view="sign_in"
            localization={{
              variables: {
                sign_in: {
                  email_label: 'Adresse email',
                  password_label: 'Mot de passe',
                  button_label: 'Se connecter',
                  loading_button_label: 'Connexion en cours…',
                  social_provider_text: 'Continuer avec {{provider}}',
                  link_text: "Tu n'as pas de compte ? Inscris-toi",
                },
                sign_up: {
                  email_label: 'Adresse email',
                  password_label: 'Mot de passe',
                  button_label: "S'inscrire",
                  loading_button_label: 'Inscription en cours…',
                  social_provider_text: 'Continuer avec {{provider}}',
                  link_text: 'Tu as déjà un compte ? Connecte-toi',
                },
              },
            }}
          />
        </div>
      </div>
    </div>
  )
}
