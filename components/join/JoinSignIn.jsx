import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, MailCheck, Smartphone } from 'lucide-react'
import Icon from '@/components/ui/Icon'
import GoogleLogo from '@/components/auth/GoogleLogo'
import { createClient } from '@/utils/supabase/client'
import {
  EMAIL_RE,
  MESSAGES,
  RESEND_COOLDOWN_S,
  isNetworkError,
  isRateLimited,
  redirectUrl,
} from '@/components/auth/signInHelpers'
import ui from '@/components/ui/ui.module.css'
import form from '@/components/auth/AuthForm.module.css'

/**
 * Step « Sign in » of a join link: Google or an email magic link, with account creation
 * allowed (the new account starts pending; the join page approves it by claiming the
 * link). Both come back to /auth/callback?next=/join/<token>.
 * @param {{ next: string, onBack: () => void }} props  next: '/join/<token>'
 */
export default function JoinSignIn({ next, onBack }) {
  const [email, setEmail] = useState('')
  const [emailError, setEmailError] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(null) // null | 'google' | 'email'
  const [sentTo, setSentTo] = useState('')
  const [cooldown, setCooldown] = useState(0)
  const [notice, setNotice] = useState('')
  const emailRef = useRef(null)
  const sentTitleRef = useRef(null)

  // Back from Google with the browser's back button (page restored from cache)
  useEffect(() => {
    const onShow = (event) => {
      if (event.persisted) setBusy(null)
    }
    window.addEventListener('pageshow', onShow)
    return () => window.removeEventListener('pageshow', onShow)
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return undefined
    const timer = setTimeout(() => setCooldown((s) => s - 1), 1000)
    return () => clearTimeout(timer)
  }, [cooldown])

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
        options: { redirectTo: redirectUrl(next), queryParams: { prompt: 'select_account' } },
      })
      if (oauthError) throw oauthError
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
      // Account creation allowed here: the invitation is what approves it
      const { error: otpError } = await createClient().auth.signInWithOtp({
        email: address,
        options: { shouldCreateUser: true, emailRedirectTo: redirectUrl(next) },
      })
      if (otpError && isRateLimited(otpError)) {
        setError(MESSAGES.rateLimited)
        setCooldown(RESEND_COOLDOWN_S)
        return false
      }
      // Account creation is allowed here: any other error is a real failure
      if (otpError) {
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

  const errorBox = error ? (
    <p className={`${form.message} ${form.error}`} role="alert">
      {error}
    </p>
  ) : null

  if (sentTo) {
    return (
      <div className={form.panel}>
        <h2 ref={sentTitleRef} tabIndex={-1} className={form.panelTitle}>
          <Icon icon={MailCheck} size="1.1em" /> Check your inbox
        </h2>
        <p className={form.text}>
          We’ve sent a sign-in link to <span className={form.email}>{sentTo}</span>.
        </p>
        <ul className={form.tips}>
          <li>Open it on this device, in this browser: the link only works where you asked for it.</li>
          <li>It can take a minute to arrive: check your spam folder too.</li>
        </ul>
        <div role="status">{notice && <p className={`${form.message} ${form.info}`}>{notice}</p>}</div>
        {errorBox}
        <div className={form.actions}>
          <button
            type="button"
            className={`${ui.btn} ${ui.ghost} ${ui.block}`}
            onClick={handleResend}
            disabled={busy !== null || cooldown > 0}
          >
            {busy === 'email' ? 'Sending…' : cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend the link'}
          </button>
          <button type="button" className={form.textButton} onClick={changeEmail}>
            Use a different email
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={form.form}>
      {errorBox}
      <button
        type="button"
        className={`${ui.btn} ${ui.block} ${form.google}`}
        onClick={signInWithGoogle}
        disabled={busy !== null}
      >
        <GoogleLogo />
        {busy === 'google' ? 'Opening Google…' : 'Continue with Google'}
      </button>

      <div className={form.divider}>or</div>

      <form className={form.emailForm} onSubmit={handleSubmit} noValidate>
        <label htmlFor="join-email" className={form.label}>
          Email address
        </label>
        <input
          ref={emailRef}
          id="join-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="you@example.com"
          className={form.input}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value)
            if (emailError) setEmailError('')
          }}
          aria-invalid={emailError ? 'true' : undefined}
          aria-describedby={emailError ? 'join-email-error' : 'join-device-note'}
          maxLength={254}
          required
        />
        {emailError && (
          <p id="join-email-error" className={form.fieldError}>
            {emailError}
          </p>
        )}
        <button type="submit" className={`${ui.btn} ${ui.green} ${ui.block}`} disabled={busy !== null}>
          {busy === 'email' ? 'Sending…' : 'Email me a sign-in link'}
        </button>
      </form>

      <p id="join-device-note" className={form.note}>
        <span className={form.noteIcon}>
          <Icon icon={Smartphone} size={18} />
        </span>
        <span>Use the same device and browser from start to finish: the email link only works where you asked for it.</span>
      </p>

      <button type="button" className={form.textButton} onClick={onBack} disabled={busy !== null}>
        <Icon icon={ArrowLeft} size={16} /> Back
      </button>
    </div>
  )
}
