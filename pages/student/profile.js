import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from '@/components/AuthProvider'
import StudentShell from '@/components/student/StudentShell'
import ProfileForm from '@/components/student/profile/ProfileForm'
import DeleteAccountDialog from '@/components/student/profile/DeleteAccountDialog'
import { levelShort } from '@/components/student/profile/levels'
import { ErrorCard } from '@/components/student/lessons/StatusViews'
import { api } from '@/utils/apiClient'
import { safeHttpsUrl } from '@/utils/lesson/schema'
import ui from '@/components/student/ui.module.css'
import styles from '@/components/student/profile/Profile.module.css'

function ProfileSkeleton() {
  return (
    <div aria-hidden="true">
      <div className={styles.hero}>
        <span className={`${ui.skel} ${styles.bigAvatarSkel}`} />
        <div className={styles.heroText}>
          <span className={ui.skel} style={{ width: 180, maxWidth: '100%', height: 28 }} />
          <span className={ui.skel} style={{ width: 220, maxWidth: '100%', height: 14, marginTop: 10 }} />
        </div>
      </div>
      <span className={ui.skel} style={{ height: 520, borderRadius: 20 }} />
      <span className={ui.skel} style={{ height: 150, borderRadius: 20, marginTop: 16 }} />
    </div>
  )
}

export default function StudentProfilePage() {
  const router = useRouter()
  const { user, signOut, refreshUser } = useAuth()
  const [state, setState] = useState({ status: 'loading', me: null, error: '' })
  const [reloadKey, setReloadKey] = useState(0)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [accountError, setAccountError] = useState('')
  const busyRef = useRef(false)
  const mountedRef = useRef(true)
  const deleteBtnRef = useRef(null)
  const routerRef = useRef(router)
  routerRef.current = router

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    setState((s) => ({ ...s, status: 'loading', error: '' }))

    api('/api/me', { signal })
      .then((me) => {
        if (signal.aborted) return
        if (me?.role === 'teacher') {
          routerRef.current.replace('/teacher')
          return
        }
        if (!me?.profile?.onboarded_at) {
          routerRef.current.replace('/onboarding')
          return
        }
        setState({ status: 'ready', me, error: '' })
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || signal.aborted) return
        setState({ status: 'error', me: null, error: err?.message || 'Something went wrong.' })
      })

    return () => controller.abort()
  }, [reloadKey])

  const handleSaved = (profile) => {
    setState((s) => (s.me ? { ...s, me: { ...s.me, profile: { ...s.me.profile, ...profile } } } : s))
    // The header avatar reads the auth user's name: refresh it after a rename
    if (profile?.full_name && profile.full_name !== user?.user_metadata?.full_name) refreshUser().catch(() => {})
  }

  const handleSignOut = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setSigningOut(true)
    setAccountError('')
    try {
      await signOut()
    } catch {
      // Ignore: the session cookie is cleared server-side on next request anyway
    }
    routerRef.current.replace('/login')
  }

  const closeDialog = () => {
    setConfirmOpen(false)
    requestAnimationFrame(() => deleteBtnRef.current?.focus())
  }

  const handleDelete = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setDeleting(true)
    setAccountError('')
    try {
      await api('/api/student/deleteProfile', { method: 'POST' })
      await signOut().catch(() => {})
      routerRef.current.replace('/login')
    } catch (err) {
      busyRef.current = false
      if (!mountedRef.current) return
      setDeleting(false)
      setAccountError(err?.message || 'Could not delete your account. Please try again.')
      closeDialog()
    }
  }

  const profile = state.me?.profile || null
  const email = state.me?.user?.email || profile?.email || user?.email || ''
  const name = profile?.full_name || ''
  const initial = ((name || email).trim()[0] || '?').toUpperCase()
  const level = levelShort(profile?.level)
  const driveUrl = safeHttpsUrl(profile?.drive_folder_url)

  return (
    <StudentShell>
      <Head>
        <title>Profile · Preply Lessons</title>
      </Head>

      {state.status === 'error' ? (
        <>
          <h1 className={styles.pageTitle}>Your profile</h1>
          <ErrorCard
            title="Couldn’t load your profile"
            message={state.error}
            onRetry={() => setReloadKey((k) => k + 1)}
          />
        </>
      ) : state.status !== 'ready' ? (
        <>
          <h1 className="sr-only">Your profile</h1>
          <span className="sr-only" role="status">
            Loading your profile…
          </span>
          <ProfileSkeleton />
        </>
      ) : (
        <div className={styles.page}>
          <header className={styles.hero}>
            <span className={styles.bigAvatar} aria-hidden="true">
              {initial}
            </span>
            <div className={styles.heroText}>
              <h1 className={styles.heroName}>{name || 'Your profile'}</h1>
              {email && <p className={styles.heroEmail}>{email}</p>}
              {level && (
                <span className={`${ui.pill} ${styles.levelPill}`}>
                  <span aria-hidden="true">🇫🇷</span>
                  <span className="sr-only">Your French level: </span>
                  {level}
                </span>
              )}
            </div>
          </header>

          <ProfileForm key={profile?.id || 'profile'} profile={profile} onSaved={handleSaved} />

          {driveUrl && (
            <section className={`${ui.card} ${styles.section}`} aria-labelledby="drive-title">
              <h2 id="drive-title" className={styles.cardTitle}>
                <span className={`${styles.cardIcon} ${styles.iconYellow}`} aria-hidden="true">
                  📁
                </span>
                Your Google Drive folder
              </h2>
              <p className={styles.cardHelp}>All your lesson documents from Wael, in one place.</p>
              <a
                href={driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`${ui.btn} ${ui.ghost} ${ui.block}`}
              >
                Open my folder<span aria-hidden="true"> ↗</span>
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </section>
          )}

          <section className={`${ui.card} ${styles.section}`} aria-labelledby="account-title">
            <h2 id="account-title" className={styles.cardTitle}>
              <span className={`${styles.cardIcon} ${styles.iconPurple}`} aria-hidden="true">
                🔐
              </span>
              Account
            </h2>
            <dl className={styles.accountRows}>
              <div className={styles.accountRow}>
                <dt>Email</dt>
                <dd>{email || '—'}</dd>
              </div>
            </dl>
            <button
              type="button"
              className={`${ui.btn} ${ui.ghost} ${ui.block}`}
              onClick={handleSignOut}
              disabled={signingOut || deleting}
            >
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </section>

          <section className={`${ui.card} ${styles.section} ${styles.danger}`} aria-labelledby="danger-title">
            <h2 id="danger-title" className={styles.cardTitle}>
              <span className={`${styles.cardIcon} ${styles.iconRed}`} aria-hidden="true">
                ⚠️
              </span>
              Danger zone
            </h2>
            <p className={styles.cardHelp}>
              Deleting your account removes your lesson recaps and progress for good.
            </p>
            {accountError && (
              <p className={styles.formError} role="alert">
                {accountError}
              </p>
            )}
            <button
              ref={deleteBtnRef}
              type="button"
              className={`${ui.btn} ${ui.block} ${styles.deleteBtn}`}
              onClick={() => setConfirmOpen(true)}
              disabled={deleting || signingOut}
            >
              Delete my account
            </button>
          </section>
        </div>
      )}

      {confirmOpen && <DeleteAccountDialog busy={deleting} onCancel={closeDialog} onConfirm={handleDelete} />}
    </StudentShell>
  )
}
