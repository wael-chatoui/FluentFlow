import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from '@/components/AuthProvider'
import { useSoundEnabled } from '@/utils/sound'
import StudentShell from '@/components/student/StudentShell'
import useMe, { setMeProfile } from '@/components/student/useMe'
import { markSigningOut } from '@/components/student/cache'
import ProfileForm from '@/components/student/profile/ProfileForm'
import DeleteAccountDialog from '@/components/student/profile/DeleteAccountDialog'
import { levelShort } from '@/utils/profile/levels'
import { ErrorCard } from '@/components/student/lessons/StatusViews'
import { api } from '@/utils/apiClient'
import { safeHttpsUrl } from '@/utils/lesson/schema'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/student/profile/Profile.module.css'
import { ExternalLink, Folder, Languages, LockKeyhole, TriangleAlert } from 'lucide-react'
import Icon from '@/components/ui/Icon'

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
  const { user, signOut } = useAuth()
  const { me, error: loadError, reload } = useMe({ maxAge: 0 }) // fresh values for the form
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const [accountError, setAccountError] = useState('')
  const [leaving, setLeaving] = useState(false) // signing out / deleting: no unsaved-changes prompt
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

  // Every page (and the header avatar) reads the profile from the shared cache
  const handleSaved = (profile) => setMeProfile(profile)

  const handleSignOut = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setSigningOut(true)
    setLeaving(true)
    setAccountError('')
    markSigningOut() // this page goes to /login by itself
    try {
      await signOut()
    } catch {
      // Ignore: the session cookie is cleared server-side on next request anyway
    }
    routerRef.current.replace('/login')
  }

  // The dialog puts the focus back on the Delete button when it closes
  const closeDialog = () => setConfirmOpen(false)

  const handleDelete = async () => {
    if (busyRef.current) return
    busyRef.current = true
    setDeleting(true)
    setLeaving(true)
    setAccountError('')
    try {
      await api('/api/student/deleteProfile', { method: 'POST' })
      markSigningOut()
      await signOut().catch(() => {})
      routerRef.current.replace('/login')
    } catch (err) {
      busyRef.current = false
      if (!mountedRef.current) return
      setDeleting(false)
      setLeaving(false)
      setAccountError(err?.message || 'Could not delete your account. Please try again.')
      closeDialog()
    }
  }

  const profile = me?.profile || null
  const email = me?.user?.email || profile?.email || user?.email || ''
  const name = profile?.full_name || ''
  const initial = ((name || email).trim()[0] || '?').toUpperCase()
  const level = levelShort(profile?.level)
  const driveUrl = safeHttpsUrl(profile?.drive_folder_url)

  return (
    <StudentShell>
      <Head>
        <title>Profile · Preply Lessons</title>
      </Head>

      {!me && loadError ? (
        <>
          <h1 className={styles.pageTitle}>Your profile</h1>
          <ErrorCard title="Couldn’t load your profile" message={loadError.message} onRetry={reload} />
        </>
      ) : !me ? (
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
                  <Icon icon={Languages} size={16} />
                  <span className="sr-only">Your French level: </span>
                  {level}
                </span>
              )}
            </div>
          </header>

          <ProfileForm key={profile?.id || 'profile'} profile={profile} onSaved={handleSaved} guard={!leaving} />

          {driveUrl && (
            <section className={`${ui.card} ${styles.section}`} aria-labelledby="drive-title">
              <h2 id="drive-title" className={styles.cardTitle}>
                <span className={`${styles.cardIcon} ${styles.iconYellow}`} aria-hidden="true">
                  <Icon icon={Folder} size={20} />
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
                Open my folder <Icon icon={ExternalLink} size={18} />
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            </section>
          )}

          <section className={`${ui.card} ${styles.section}`} aria-labelledby="account-title">
            <h2 id="account-title" className={styles.cardTitle}>
              <span className={`${styles.cardIcon} ${styles.iconPurple}`} aria-hidden="true">
                <Icon icon={LockKeyhole} size={20} />
              </span>
              Account
            </h2>
            <dl className={styles.accountRows}>
              <div className={styles.accountRow}>
                <dt>Email</dt>
                <dd>{email || '—'}</dd>
              </div>
            </dl>
            <SoundSwitch />
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
                <Icon icon={TriangleAlert} size={20} />
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

      {confirmOpen && (
        <DeleteAccountDialog busy={deleting} onCancel={closeDialog} onConfirm={handleDelete} returnFocusRef={deleteBtnRef} />
      )}
    </StudentShell>
  )
}

function SoundSwitch() {
  const [enabled, setEnabled] = useSoundEnabled()
  return (
    <label className={styles.switchRow}>
      <span>
        <strong>Sound effects</strong>
        <span className={styles.switchHint}>Little sounds for right and wrong answers</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        className={styles.switch}
        checked={enabled}
        onChange={(e) => setEnabled(e.target.checked)}
      />
    </label>
  )
}
