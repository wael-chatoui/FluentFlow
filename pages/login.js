import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { Languages, MailCheck, Ticket } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import AuthScreen, { AuthHeader } from '@/components/auth/AuthScreen'
import LoadingScreen from '@/components/ui/LoadingScreen'
import Icon from '@/components/ui/Icon'
import GoogleLogo from '@/components/auth/GoogleLogo'
import { destinationAfterSignIn, fallbackDestination } from '@/components/auth/afterSignIn'
import { createClient } from '@/utils/supabase/client'
import { takePartialSignOut } from '@/utils/supabase/signOut'
import { safeNext } from '@/utils/auth/routing'
import {
  EMAIL_RE,
  MESSAGES,
  RESEND_COOLDOWN_S,
  isNetworkError,
  isRateLimited,
  isServerError,
  redirectUrl,
} from '@/components/auth/signInHelpers'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/auth/AuthForm.module.css'

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
        icon={Languages}
        title="Preply Lessons"
        subtitle="Sign in to see your French lessons and practice"
      />

      {sentTo ? (
        <div className={styles.panel}>
          <h2 ref={sentTitleRef} tabIndex={-1} className={styles.panelTitle}>
            <Icon icon={MailCheck} size="1.1em" /> Check your inbox
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
            <span className={styles.noteIcon}>
              <Icon icon={Ticket} size={18} />
            </span>
            <span>Access is by invitation. New here? Ask your teacher for your invitation link and open it to join.</span>
          </p>
        </div>
      )}
    </AuthScreen>
  )
}
