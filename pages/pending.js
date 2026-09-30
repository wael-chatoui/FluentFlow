import { useCallback, useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Hourglass, Ticket } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import AuthScreen, { AuthHeader } from '@/components/auth/AuthScreen'
import LoadingScreen from '@/components/ui/LoadingScreen'
import Icon from '@/components/ui/Icon'
import { readJoinToken } from '@/components/join/joinToken'
import { destinationAfterSignIn } from '@/components/auth/afterSignIn'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/auth/AuthForm.module.css'

// Re-check automatically when the student comes back to the tab, at most this often
const AUTO_CHECK_MS = 30000

const timeLabel = (date) => date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

/**
 * Accounts created by self sign-up (e.g. Google with an address the teacher did not
 * invite) wait here until the teacher approves them (the proxy and api() send them here).
 */
export default function PendingPage() {
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router
  const { user, loading } = useAuth()
  const [joinToken, setJoinToken] = useState(null)
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState({ tone: '', text: '' })
  const checkingRef = useRef(false)
  const lastCheckRef = useRef(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!loading && !user) routerRef.current.replace('/login')
  }, [loading, user])

  // An invitation link opened in this browser (its sign-in lost the way back to it)
  useEffect(() => {
    setJoinToken(readJoinToken())
  }, [])

  // Approved → go in; still pending → say so (only when the student asked)
  const check = useCallback(async ({ silent = false } = {}) => {
    if (checkingRef.current) return
    checkingRef.current = true
    lastCheckRef.current = Date.now()
    if (!silent) setChecking(true)
    try {
      const destination = await destinationAfterSignIn()
      if (!mountedRef.current) return
      if (destination !== '/pending') {
        routerRef.current.replace(destination)
        return
      }
      if (!silent) {
        setStatus({ tone: 'info', text: `Still waiting (checked at ${timeLabel(new Date())}). We’ll let you in as soon as your teacher approves your account.` })
      }
    } catch (err) {
      // 401 (e.g. the teacher refused the request): api() is already sending the user to /login
      if (!mountedRef.current || err?.status === 401) return
      if (!silent) setStatus({ tone: 'error', text: err?.message || 'Could not check right now. Please try again.' })
    } finally {
      checkingRef.current = false
      if (mountedRef.current) setChecking(false)
    }
  }, [])

  // Once on arrival (the proxy may be a step behind), then whenever the tab comes back
  const userId = user?.id
  useEffect(() => {
    if (!userId) return undefined
    check({ silent: true })
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastCheckRef.current > AUTO_CHECK_MS) {
        check({ silent: true })
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [userId, check])

  if (loading || !user) {
    return (
      <>
        <Head>
          <title>Waiting for approval · Preply Lessons</title>
        </Head>
        <LoadingScreen />
      </>
    )
  }

  return (
    <AuthScreen labelledBy="pending-title">
      <Head>
        <title>Waiting for approval · Preply Lessons</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <AuthHeader
        id="pending-title"
        icon={Hourglass}
        tone="purple"
        title="Almost there!"
        subtitle="Your account is waiting for your teacher’s approval."
      />
      <div className={styles.panel}>
        <p className={styles.text}>
          You’re signed in as <span className={styles.email}>{user.email}</span>. Your teacher sees your request in their
          dashboard. A quick message on Preply can speed things up.
        </p>
        {joinToken && (
          <p className={styles.note}>
            <span className={styles.noteIcon}>
              <Icon icon={Ticket} size={18} />
            </span>
            <span>
              Have an invitation link from your teacher?{' '}
              <Link href={`/join/${joinToken}`}>Open it again</Link> to finish joining.
            </span>
          </p>
        )}
        <div role="status" aria-live="polite">
          {status.text && <p className={`${styles.message} ${styles[status.tone] || ''}`}>{status.text}</p>}
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={`${ui.btn} ${ui.green} ${ui.block}`}
            onClick={() => check()}
            disabled={checking}
            aria-busy={checking || undefined}
          >
            {checking ? 'Checking…' : 'Check again'}
          </button>
          <Link href="/logout" className={`${ui.btn} ${ui.ghost} ${ui.block}`}>
            Sign out
          </Link>
        </div>
        <p className={`${styles.text} ${styles.soft}`}>
          Wrong account? Sign out, then sign in with the email address your teacher invited.
        </p>
      </div>
    </AuthScreen>
  )
}
