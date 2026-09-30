import { useCallback, useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { BookOpen, Dumbbell, Hourglass, Link2Off, LogIn, PartyPopper, Presentation, Sparkles, WifiOff } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import AuthScreen, { AuthHeader } from '@/components/auth/AuthScreen'
import LoadingScreen from '@/components/ui/LoadingScreen'
import Icon from '@/components/ui/Icon'
import JoinSteps from '@/components/join/JoinSteps'
import JoinSignIn from '@/components/join/JoinSignIn'
import { forgetJoinToken, rememberJoinToken } from '@/components/join/joinToken'
import { api } from '@/utils/apiClient'
import ui from '@/components/ui/ui.module.css'
import form from '@/components/auth/AuthForm.module.css'
import styles from '@/components/join/JoinPage.module.css'

// Why a link cannot be used (GET /api/join/[token] reason, or the claim's error code)
const INVALID = {
  unknown: { icon: Link2Off, title: 'This link doesn’t work', text: 'It may be incomplete: copy the whole link again, or ask your teacher for a new one.' },
  used: { icon: Link2Off, title: 'This link was already used', text: 'Each invitation link works only once. Ask your teacher for a new one in the Preply chat.' },
  expired: { icon: Hourglass, title: 'This link has expired', text: 'Invitation links work for 14 days. Ask your teacher for a new one in the Preply chat.' },
  revoked: { icon: Link2Off, title: 'This link was canceled', text: 'Your teacher canceled this invitation. Ask them for a new one in the Preply chat.' },
}
const INVALID_CODES = Object.keys(INVALID)

const firstName = (label) => String(label || '').trim().split(/\s+/)[0] || ''

/**
 * POST claim, fresh session (it still says "not approved"), then where to go.
 * Never throws: resolves to { destination } or { error }.
 */
async function runClaim(token, refreshUser) {
  try {
    await api(`/api/join/${encodeURIComponent(token)}/claim`, { method: 'POST' })
    forgetJoinToken()
    await refreshUser().catch(() => {})
    const me = await api('/api/me')
    return { destination: me?.profile?.onboarded_at ? '/student' : '/onboarding?from=join' }
  } catch (error) {
    return { error }
  }
}

/**
 * /join/<token>: a one-time invitation link from the teacher (no email address needed).
 * Welcome → Sign in (Google or magic link, account creation allowed) → the page claims the
 * link (POST /api/join/[token]/claim approves the account) → onboarding (?from=join, same
 * breadcrumb) → student home. Public page (proxy SHARED_PATHS).
 */
export default function JoinPage() {
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router
  const token = router.isReady ? String(router.query.token || '') : null
  const { user, role, isAdmin, loading, refreshUser, signOut } = useAuth()

  const [info, setInfo] = useState(null) // { valid, reason?, label?, teacherName }
  const [infoError, setInfoError] = useState('')
  const [infoRun, setInfoRun] = useState(0)
  const [step, setStep] = useState('welcome') // welcome | signin (signed out)
  const [claim, setClaim] = useState({ status: 'idle' }) // idle | working | invalid {reason} | failed {message}
  const [claimRun, setClaimRun] = useState(0)
  const claimRef = useRef({ key: null, promise: null }) // in-flight claim for `${userId}:${token}:${run}`
  const stepTitleRef = useRef(null)

  // Who invited me, and does the link still work? (public, no sign-in)
  useEffect(() => {
    if (!token) return undefined
    const controller = new AbortController()
    setInfoError('')
    api(`/api/join/${encodeURIComponent(token)}`, { signal: controller.signal })
      .then((data) => {
        if (controller.signal.aborted) return
        setInfo(data)
        if (data?.valid) rememberJoinToken(token)
        else forgetJoinToken()
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.name === 'AbortError') return
        setInfoError(err?.message || 'We couldn’t load your invitation. Please try again.')
      })
    return () => controller.abort()
  }, [token, infoRun])

  const userId = user?.id
  const isStudent = Boolean(userId) && role === 'student' && !isAdmin

  // Signed in as a student: claim the link (idempotent), then onboarding or home.
  // The request lives in a ref, so a re-run effect (dev StrictMode) joins it instead of
  // sending it twice or dropping its answer.
  useEffect(() => {
    if (!token || loading || !isStudent || !info) return undefined
    const key = `${userId}:${token}:${claimRun}`
    if (claimRef.current.key !== key) {
      claimRef.current = { key, promise: runClaim(token, refreshUser) }
    }
    let active = true
    setClaim({ status: 'working' })
    claimRef.current.promise.then((outcome) => {
      if (!active) return
      if (outcome.destination) {
        routerRef.current.replace(outcome.destination)
        return
      }
      const err = outcome.error
      if (err?.status === 401) return // api() is sending the browser to /login
      if (INVALID_CODES.includes(err?.code)) {
        forgetJoinToken()
        setClaim({ status: 'invalid', reason: err.code })
      } else if (err?.code === 'not_student') {
        setClaim({ status: 'teacher' })
      } else {
        setClaim({ status: 'failed', message: err?.message || 'Something went wrong. Please try again.' })
      }
    })
    return () => {
      active = false
    }
  }, [token, loading, isStudent, userId, info, claimRun, refreshUser])

  // Move focus to the new step's title, so it gets announced
  useEffect(() => {
    if (step === 'signin') stepTitleRef.current?.focus()
  }, [step])

  const retryClaim = useCallback(() => setClaimRun((n) => n + 1), [])
  const switchAccount = useCallback(async () => {
    await signOut({ scope: 'local' })
    setClaim({ status: 'idle' })
    setStep('welcome')
  }, [signOut])

  const next = token ? `/join/${token}` : '/'
  const head = (
    <Head>
      <title>Join your French lessons · Preply Lessons</title>
      <meta name="robots" content="noindex, nofollow" />
      {/* The token is in the URL: never send it to Google or anyone else */}
      <meta name="referrer" content="no-referrer" />
    </Head>
  )

  if (infoError && !info) {
    return (
      <AuthScreen labelledBy="join-title">
        {head}
        <div role="alert">
          <AuthHeader id="join-title" icon={WifiOff} tone="blue" title="We couldn’t load your invitation" subtitle={infoError} />
        </div>
        <button type="button" className={`${ui.btn} ${ui.green} ${ui.block}`} onClick={() => setInfoRun((n) => n + 1)}>
          Try again
        </button>
      </AuthScreen>
    )
  }

  if (!token || loading || !info) {
    return (
      <>
        {head}
        <LoadingScreen />
      </>
    )
  }

  // A teacher (or an admin) testing the link: never claim it with that account
  if ((userId && !isStudent) || claim.status === 'teacher') {
    return (
      <AuthScreen labelledBy="join-title">
        {head}
        <AuthHeader
          id="join-title"
          icon={Presentation}
          tone="purple"
          title="You’re signed in as the teacher"
          subtitle="This invitation link is for a student. Send it to them in the Preply chat, or open it in a private window to try it."
        />
        <div className={form.actions}>
          <Link href={isAdmin && role !== 'teacher' ? '/admin' : '/teacher'} className={`${ui.btn} ${ui.green} ${ui.block}`}>
            {isAdmin && role !== 'teacher' ? 'Go to the back office' : 'Go to the teacher area'}
          </Link>
        </div>
      </AuthScreen>
    )
  }

  const invalidReason = claim.status === 'invalid' ? claim.reason : !userId && !info.valid ? info.reason || 'unknown' : null
  if (invalidReason) {
    const copy = INVALID[invalidReason] || INVALID.unknown
    return (
      <AuthScreen labelledBy="join-title">
        {head}
        <div role="alert">
          <AuthHeader id="join-title" icon={copy.icon} tone="orange" title={copy.title} subtitle={copy.text} />
        </div>
        <div className={form.actions}>
          {userId ? (
            <>
              <Link href="/" className={`${ui.btn} ${ui.green} ${ui.block}`}>
                Continue
              </Link>
              <button type="button" className={form.textButton} onClick={switchAccount}>
                Use another account
              </button>
            </>
          ) : (
            <Link href="/login" className={`${ui.btn} ${ui.ghost} ${ui.block}`}>
              Already have an account? Sign in
            </Link>
          )}
        </div>
      </AuthScreen>
    )
  }

  // Signed in: claiming (or failed to)
  if (userId) {
    return (
      <AuthScreen labelledBy="join-title">
        {head}
        <JoinSteps current="profile" />
        {claim.status === 'failed' ? (
          <>
            <div role="alert">
              <AuthHeader id="join-title" icon={WifiOff} tone="blue" title="We couldn’t finish joining" subtitle={claim.message} />
            </div>
            <div className={form.actions}>
              <button type="button" className={`${ui.btn} ${ui.green} ${ui.block}`} onClick={retryClaim}>
                Try again
              </button>
              <button type="button" className={form.textButton} onClick={switchAccount}>
                Use another account
              </button>
            </div>
          </>
        ) : (
          <div role="status">
            <AuthHeader
              id="join-title"
              icon={Sparkles}
              tone="green"
              title="Setting up your space…"
              subtitle={user?.email ? `Signed in as ${user.email}` : 'Just a moment.'}
            />
          </div>
        )}
      </AuthScreen>
    )
  }

  const name = firstName(info.label)
  const teacher = info.teacherName || 'Wael'

  if (step === 'signin') {
    return (
      <AuthScreen labelledBy="join-title">
        {head}
        <JoinSteps current="signin" />
        <AuthHeader
          id="join-title"
          icon={LogIn}
          tone="green"
          title={
            <span ref={stepTitleRef} tabIndex={-1} className={styles.focusTitle}>
              Create your account
            </span>
          }
          subtitle="Sign in with Google or with your email address. No password needed."
        />
        <JoinSignIn next={next} onBack={() => setStep('welcome')} />
      </AuthScreen>
    )
  }

  return (
    <AuthScreen labelledBy="join-title">
      {head}
      <JoinSteps current="welcome" />
      <AuthHeader
        id="join-title"
        icon={PartyPopper}
        tone="pink"
        title={name ? `Welcome, ${name}!` : 'Welcome!'}
        subtitle={`${teacher} invited you to your French lessons space.`}
      />
      <ul className={styles.perks}>
        <li>
          <span className={`${styles.perkIcon} ${styles.blue}`}>
            <Icon icon={BookOpen} size={20} />
          </span>
          <span>A recap after each lesson: new words, corrections and grammar.</span>
        </li>
        <li>
          <span className={`${styles.perkIcon} ${styles.green}`}>
            <Icon icon={Dumbbell} size={20} />
          </span>
          <span>Short, fun exercises to practice what you learned.</span>
        </li>
        <li>
          <span className={`${styles.perkIcon} ${styles.orange}`}>
            <Icon icon={Sparkles} size={20} />
          </span>
          <span>Your own word bank and flashcards.</span>
        </li>
      </ul>
      <div className={form.actions}>
        <button type="button" className={`${ui.btn} ${ui.green} ${ui.block}`} onClick={() => setStep('signin')}>
          Get started
        </button>
        <Link href={`/login?next=${encodeURIComponent(next)}`} className={form.textButton}>
          Already have an account? Sign in
        </Link>
      </div>
      <p className={styles.small}>Takes about a minute. This link is personal: please don’t share it.</p>
    </AuthScreen>
  )
}
