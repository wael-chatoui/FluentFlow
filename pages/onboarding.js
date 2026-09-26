import { useEffect, useId, useRef, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from '@/components/AuthProvider'
import { api } from '@/utils/apiClient'
import { LEVELS } from '@/utils/lesson/schema'
import styles from '@/components/lesson/StudentPages.module.css'

const LEVEL_INFO = {
  A1: { name: 'Complete beginner', desc: 'I know a few words' },
  A2: { name: 'Elementary', desc: 'Simple everyday situations' },
  B1: { name: 'Intermediate', desc: 'I can get by in most situations' },
  B2: { name: 'Upper intermediate', desc: 'I can discuss many topics' },
  C1: { name: 'Advanced', desc: 'Fluent, working on nuance' },
  C2: { name: 'Mastery', desc: 'Near-native' },
  unknown: { name: "I'm not sure", desc: 'Wael will help you find out' },
}

function ConfirmDelete({ busy, onCancel, onConfirm }) {
  const titleId = useId()
  const descId = useId()
  const cancelRef = useRef(null)
  const confirmRef = useRef(null)

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  const onKeyDown = (e) => {
    if (e.key === 'Escape' && !busy) {
      e.preventDefault()
      onCancel()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const next = document.activeElement === cancelRef.current ? confirmRef.current : cancelRef.current
      next?.focus()
    }
  }

  return (
    <div className="modal-overlay" onClick={() => !busy && onCancel()}>
      <div
        className="modal-content"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id={titleId} className="modal-title">
          Delete your account?
        </h2>
        <p id={descId} className={styles.modalText}>
          This permanently deletes your account. You can sign up again later, but this can&apos;t be undone.
        </p>
        <div className={styles.modalActions}>
          <button ref={cancelRef} type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            Keep my account
          </button>
          <button ref={confirmRef} type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
            {busy ? 'Deleting…' : 'Delete my account'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  const router = useRouter()
  const { user, loading, signOut } = useAuth()
  const routerRef = useRef(router)
  routerRef.current = router
  const userRef = useRef(user)
  userRef.current = user
  const userId = user?.id

  const [checking, setChecking] = useState(true)
  const [fullName, setFullName] = useState('')
  const [level, setLevel] = useState('')
  const [goals, setGoals] = useState('')
  const [interests, setInterests] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState('')
  const submittingRef = useRef(false)
  const deleteBtnRef = useRef(null)

  // Who am I? Already onboarded → /student; teacher → /teacher; else prefill.
  useEffect(() => {
    if (loading) return
    const user = userRef.current
    if (!userId || !user) {
      routerRef.current.replace('/login')
      return
    }
    const controller = new AbortController()
    api('/api/me', { signal: controller.signal })
      .then((me) => {
        if (controller.signal.aborted) return
        if (me?.role === 'teacher') {
          routerRef.current.replace('/teacher')
          return
        }
        if (me?.profile?.onboarded_at) {
          routerRef.current.replace('/student')
          return
        }
        const p = me?.profile || {}
        setFullName(p.full_name || user.user_metadata?.full_name || user.user_metadata?.name || '')
        if (p.level && LEVELS.includes(p.level)) setLevel(p.level)
        if (p.goals) setGoals(p.goals)
        if (p.interests) setInterests(p.interests)
        setChecking(false)
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || controller.signal.aborted) return
        // Show the form anyway; submitting will surface any real problem
        setFullName(user.user_metadata?.full_name || user.user_metadata?.name || '')
        setChecking(false)
      })
    return () => controller.abort()
    // Only once per signed-in user (token refreshes must not reset the form)
  }, [loading, userId])

  const canSubmit = fullName.trim().length > 0 && Boolean(level) && !submitting && !deleting

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSubmit || submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    setError('')
    try {
      await api('/api/onboarding/complete', {
        method: 'POST',
        body: { fullName: fullName.trim(), level, goals: goals.trim(), interests: interests.trim() },
      })
      // Full reload so every page sees the fresh profile
      window.location.href = '/student'
    } catch (err) {
      submittingRef.current = false
      setSubmitting(false)
      setError(err?.message || 'Something went wrong. Please try again.')
    }
  }

  const handleDelete = async () => {
    if (deleting) return
    setDeleting(true)
    setError('')
    try {
      await api('/api/student/deleteProfile', { method: 'POST' })
      await signOut().catch(() => {})
      window.location.href = '/login'
    } catch (err) {
      setDeleting(false)
      setConfirmOpen(false)
      setError(err?.message || 'Could not delete your account. Please try again.')
      requestAnimationFrame(() => deleteBtnRef.current?.focus())
    }
  }

  if (loading || !user || checking) {
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
        <title>Welcome · Preply Lessons</title>
      </Head>
      <div className="auth-container" style={{ maxWidth: 520 }}>
        <div className="auth-card">
          <div className="auth-logo">
            <div className="auth-logo-icon" aria-hidden="true">👋</div>
            <h1>Welcome!</h1>
            <p>Tell Wael a little about yourself so your lessons fit you.</p>
          </div>

          <form onSubmit={handleSubmit} className={styles.onboardForm} noValidate>
            <div className="form-group">
              <label htmlFor="fullName" className="label">
                Your name
              </label>
              <input
                id="fullName"
                className={`input ${styles.bigInput}`}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
                maxLength={120}
                required
              />
            </div>

            <fieldset className={styles.levels}>
              <legend className="label">Your French level</legend>
              <div className={styles.levelGrid}>
                {LEVELS.map((code) => {
                  const info = LEVEL_INFO[code] || { name: code, desc: '' }
                  const checked = level === code
                  return (
                    <label key={code} className={`${styles.level} ${checked ? styles.levelChecked : ''}`}>
                      <input
                        type="radio"
                        name="level"
                        value={code}
                        checked={checked}
                        onChange={() => setLevel(code)}
                        required
                      />
                      <span className={styles.levelCode} aria-hidden="true">
                        {code === 'unknown' ? '?' : code}
                      </span>
                      <span className={styles.levelText}>
                        <span className={styles.levelName}>
                          <span className="sr-only">{code === 'unknown' ? '' : `${code} — `}</span>
                          {info.name}
                        </span>
                        {info.desc && <span className={styles.levelDesc}>{info.desc}</span>}
                      </span>
                    </label>
                  )
                })}
              </div>
            </fieldset>

            <div className="form-group">
              <label htmlFor="goals" className="label">
                Your goals <span className={styles.fieldHelp}>(optional)</span>
              </label>
              <textarea
                id="goals"
                className={`textarea ${styles.bigInput}`}
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                placeholder="Travel, work, exams, family, moving to France…"
                rows={3}
                maxLength={1000}
              />
            </div>

            <div className="form-group">
              <label htmlFor="interests" className="label">
                Your interests <span className={styles.fieldHelp}>(optional)</span>
              </label>
              <textarea
                id="interests"
                className={`textarea ${styles.bigInput}`}
                value={interests}
                onChange={(e) => setInterests(e.target.value)}
                placeholder="Cooking, football, films, history…"
                rows={2}
                maxLength={1000}
              />
            </div>

            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}

            <div className={styles.onboardActions}>
              <button type="submit" disabled={!canSubmit} className={`btn btn-primary btn-lg ${styles.fullBtn}`}>
                {submitting ? 'Saving…' : 'Start learning'}
              </button>
              {!level && fullName.trim() && (
                <p className={styles.fieldHelp} style={{ textAlign: 'center' }}>
                  Choose your level to continue.
                </p>
              )}
              <button
                ref={deleteBtnRef}
                type="button"
                onClick={() => setConfirmOpen(true)}
                disabled={deleting || submitting}
                className={`btn btn-ghost ${styles.dangerLink}`}
              >
                Cancel and delete my account
              </button>
            </div>
          </form>
        </div>
      </div>

      {confirmOpen && (
        <ConfirmDelete
          busy={deleting}
          onCancel={() => {
            setConfirmOpen(false)
            requestAnimationFrame(() => deleteBtnRef.current?.focus())
          }}
          onConfirm={handleDelete}
        />
      )}
    </div>
  )
}
