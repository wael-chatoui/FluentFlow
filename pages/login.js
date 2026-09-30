import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from '@/components/AuthProvider'
import AuthScreen, { AuthHeader } from '@/components/auth/AuthScreen'
import LoadingScreen from '@/components/ui/LoadingScreen'
import { destinationAfterSignIn, fallbackDestination } from '@/components/auth/afterSignIn'
import { createClient } from '@/utils/supabase/client'
import { takePartialSignOut } from '@/utils/supabase/signOut'
import { safeNext } from '@/utils/auth/routing'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/auth/AuthForm.module.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Supabase accepts one sign-in email per address per minute (default settings)
const RESEND_COOLDOWN_S = 60

const MESSAGES = {
  invalidEmail: 'Enter a valid email address, like name@example.com.',
  rateLimited: 'Too many sign-in emails were requested. Please wait a minute and try again.',
  network: 'We couldn’t reach the server. Check your connection and try again.',
  sendFailed: 'We couldn’t send the email right now. Please try again in a few minutes.',
  google: 'Google sign-in couldn’t start. Please try again.',
  banned: 'This account has been suspended. Contact your teacher if you think this is a mistake.',
  signedOutHereOnly:
    'You’re signed out on this device. We couldn’t reach the server to sign you out on your other devices: sign out there too if needed.',
}

const isRateLimited = (error) =>
  error?.status === 429 || /rate.?limit/i.test(`${error?.code || ''} ${error?.message || ''}`)
const isNetworkError = (error) => error?.name === 'AuthRetryableFetchError' || error?.status === 0
// Email provider or Auth server failure. An unknown address gets a 4xx, so saying so
// does not reveal which addresses have an account.
const isServerError = (error) => Number(error?.status) >= 500

function redirectUrl(next) {
  return `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`
}

function GoogleLogo() {
  return (
    <svg className={styles.logo} viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path
        fill="#FFC107"
        d="M43.61 20.08H42V20H24v8h11.3C33.65 32.66 29.22 36 24 36c-6.63 0-12-5.37-12-12s5.37-12 12-12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.34-.14-2.65-.39-3.92z"
      />
      <path
        fill="#FF3D00"
        d="M6.31 14.69l6.57 4.82C14.66 15.11 18.96 12 24 12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 16.32 4 9.66 8.34 6.31 14.69z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.17 0 9.86-1.98 13.41-5.19l-6.19-5.24C29.21 35.09 26.72 36 24 36c-5.2 0-9.62-3.32-11.28-7.95l-6.52 5.02C9.51 39.56 16.23 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.61 20.08H42V20H24v8h11.3c-.79 2.24-2.23 4.17-4.09 5.57l6.19 5.24C36.97 39.21 44 34 44 24c0-1.34-.14-2.65-.39-3.92z"
      />
    </svg>
  )
}

/**
 * Passwordless, invite-only sign-in: "Continue with Google" or a magic link
 * (never creates an account). Keeps a safe ?next= through the whole flow.
 */
export default function LoginPage() {
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router
  const { user, loading, signOut } = useAuth()

  const [next, setNext] = useState(null)
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null) // null | 'google' | 'email'
  const [sentTo, setSentTo] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [notice, setNotice] = useState('')
  const [leaving, setLeaving] = useState(false)
  const [signedOutHereOnly, setSignedOutHereOnly] = useState(false)
  const emailRef = useRef(null)
  const sentTitleRef = useRef(null)

  useEffect(() => {
    if (router.isReady) setNext(safeNext(router.query.next))
  }, [router.isReady, router.query.next])

  // Just signed out, but the other devices could not be (offline): say so once
  useEffect(() => {
    if (takePartialSignOut()) setSignedOutHereOnly(true)
  }, [])

  // Already signed in (or signed in from another tab) → straight to the right area
  const userId = user?.id
  const userRef = useRef(user)
  userRef.current = user
  useEffect(() => {
    if (loading || !router.isReady) return undefined
    if (!userId) {
      setLeaving(false)
      return undefined
    }
    const controller = new AbortController()
    const target = safeNext(router.query.next)
    setLeaving(true)
    destinationAfterSignIn({ next: target, signal: controller.signal })
      .then((path) => {
        if (!controller.signal.aborted) routerRef.current.replace(path)
      })
      .catch((err) => {
        // 401: api() signs the stale session out and reloads /login
        if (controller.signal.aborted || err?.name === 'AbortError' || err?.status === 401) return
        if (err?.code === 'banned') {
          setError(MESSAGES.banned)
          signOut()
          return
        }
        routerRef.current.replace(fallbackDestination(userRef.current, target))
      })
    return () => controller.abort()
  }, [loading, userId, router.isReady, router.query.next, signOut])

  // Back from Google with the browser's back button (page restored from cache)
  useEffect(() => {
    const onShow = (event) => {
      if (event.persisted) setBusy(null)
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

  // Resend countdown
  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

  // Move focus to the confirmation so it gets announced
  useEffect(() => {
    if (sentTo) sentTitleRef.current?.focus()
  }, [sentTo])

  const signInWithGoogle = async () => {
    if (busy) return
    setBusy('google')
    setError('')
    try {
      const { error: oauthError } = await createClient().auth.signInWithOAuth({
        provider: 'google',
        // Always offer the account chooser: signing in with the wrong Google account
        // would create an account waiting for approval instead of opening the invited one
        options: { redirectTo: redirectUrl(next), queryParams: { prompt: 'select_account' } },
      })
      if (oauthError) throw oauthError
      // The browser is now leaving for Google: keep the button busy
    } catch (err) {
      setBusy(null)
      setError(isNetworkError(err) ? MESSAGES.network : MESSAGES.google)
    }
  }

  const sendLink = async (address) => {
    setBusy('email')
    setError('')
    setNotice('')
    try {
      const { error: otpError } = await createClient().auth.signInWithOtp({
        email: address,
        options: { shouldCreateUser: false, emailRedirectTo: redirectUrl(next) },
      })
      // Same answer whether the account exists or not (no account enumeration)
      if (otpError && isRateLimited(otpError)) {
        setError(MESSAGES.rateLimited)
        setCooldown(RESEND_COOLDOWN_S)
        return false
      }
      if (otpError && (isNetworkError(otpError) || isServerError(otpError))) {
        setError(isNetworkError(otpError) ? MESSAGES.network : MESSAGES.sendFailed)
        return false
      }
      setCooldown(RESEND_COOLDOWN_S)
      return true
    } catch {
      setError(MESSAGES.network)
      return false
    } finally {
      setBusy(null)
    }
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    if (busy) return
    const address = email.trim().toLowerCase()
    if (!EMAIL_RE.test(address) || address.length > 254) {
      setEmailError(MESSAGES.invalidEmail)
      emailRef.current?.focus()
      return
    }
    setEmailError('')
    if (await sendLink(address)) setSentTo(address)
  }

  const handleResend = async () => {
    if (busy || cooldown > 0 || !sentTo) return
    if (await sendLink(sentTo)) setNotice('We’ve sent a new link. Only the most recent one works.')
  }

  const changeEmail = () => {
    setSentTo('')
    setError('')
    setNotice('')
    requestAnimationFrame(() => emailRef.current?.focus())
  }

  const head = (
    <Head>
      <title>Sign in · Preply Lessons</title>
    </Head>
  )

  // A signed-in browser is always sent on (or signed out if suspended): no form flash
  if (loading || leaving || userId) {
    return (
      <>
        {head}
        <LoadingScreen />
      </>
    )
  }

  const errorBox = error ? (
    <p className={`${styles.message} ${styles.error}`} role="alert">
      {error}
    </p>
  ) : null

  return (
    <AuthScreen labelledBy="login-title">
      {head}
      <AuthHeader
        id="login-title"
        emoji="🇫🇷"
        title="Preply Lessons"
        subtitle="Sign in to see your French lessons and practice"
      />

      {sentTo ? (
        <div className={styles.panel}>
          <h2 ref={sentTitleRef} tabIndex={-1} className={styles.panelTitle}>
            <span aria-hidden="true">📬</span> Check your inbox
          </h2>
          <p className={styles.text}>
            If an account exists for <span className={styles.email}>{sentTo}</span>, we’ve sent you a sign-in link. Open
            it on this device.
          </p>
          <ul className={styles.tips}>
            <li>It can take a minute to arrive: check your spam folder too.</li>
            <li>The link works only once, in the browser you asked from.</li>
          </ul>
          <div role="status">{notice && <p className={`${styles.message} ${styles.info}`}>{notice}</p>}</div>
          {errorBox}
          <div className={styles.actions}>
            <button
              type="button"
              className={`${ui.btn} ${ui.ghost} ${ui.block}`}
              onClick={handleResend}
              disabled={busy !== null || cooldown > 0}
            >
              {busy === 'email' ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend the link'}
            </button>
            <button type="button" className={styles.textButton} onClick={changeEmail}>
              Use a different email
            </button>
          </div>
        </div>
      ) : (
        <div className={styles.form}>
          {signedOutHereOnly && (
            <p className={`${styles.message} ${styles.info}`} role="status">
              {MESSAGES.signedOutHereOnly}
            </p>
          )}
          {errorBox}
          <button
            type="button"
            className={`${ui.btn} ${ui.block} ${styles.google}`}
            onClick={signInWithGoogle}
            disabled={busy !== null}
          >
            <GoogleLogo />
            {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
          </button>

          <div className={styles.divider}>or</div>

          <form className={styles.emailForm} onSubmit={handleSubmit} noValidate>
            <label htmlFor="login-email" className={styles.label}>
              Email address
            </label>
            <input
              ref={emailRef}
              id="login-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="you@example.com"
              className={styles.input}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value)
                if (emailError) setEmailError('')
              }}
              aria-invalid={emailError ? 'true' : undefined}
              aria-describedby={emailError ? 'login-email-error' : undefined}
              maxLength={254}
              required
            />
            {emailError && (
              <p id="login-email-error" className={styles.fieldError}>
                {emailError}
              </p>
            )}
            <button type="submit" className={`${ui.btn} ${ui.green} ${ui.block}`} disabled={busy !== null}>
              {busy === 'email' ? 'Sending…' : 'Email me a sign-in link'}
            </button>
          </form>

          <p className={styles.note}>
            <span className={styles.noteIcon} aria-hidden="true">
              💌
            </span>
            <span>Access is by invitation. New here? Ask your teacher to invite you: you’ll get a personal sign-in link.</span>
          </p>
        </div>
      )}
    </AuthScreen>
  )
}
