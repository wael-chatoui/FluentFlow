import { useCallback, useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { useAuth } from '@/components/AuthProvider'
import { api } from '@/utils/apiClient'
import { LEVELS } from '@/utils/lesson/schema'
import ConfirmDialog from '@/components/onboarding/ConfirmDialog'
import OnboardingFooter from '@/components/onboarding/OnboardingFooter'
import OnboardingLayout from '@/components/onboarding/OnboardingLayout'
import OnboardingSkeleton from '@/components/onboarding/OnboardingSkeleton'
import ProgressHeader from '@/components/onboarding/ProgressHeader'
import StepActions from '@/components/onboarding/StepActions'
import StepGoals from '@/components/onboarding/StepGoals'
import StepInterests from '@/components/onboarding/StepInterests'
import StepLevel from '@/components/onboarding/StepLevel'
import StepName from '@/components/onboarding/StepName'
import StepSummary from '@/components/onboarding/StepSummary'
import { ArrowLeftIcon } from '@/components/onboarding/Icons'
import { clearDraft, loadDraft, saveDraft } from '@/components/onboarding/draft'
import {
  EMPTY_ANSWERS,
  GOAL_OPTIONS,
  INTEREST_OPTIONS,
  NAME_MAX,
  STEPS,
  STEP_COUNT,
  hasInterests,
  parseChoices,
  stepValidity,
  toPayload,
} from '@/components/onboarding/options'
import styles from '@/components/onboarding/Steps.module.css'

const AUTO_ADVANCE_MS = 250

function PageHead() {
  return (
    <Head>
      <title>Welcome · Preply Lessons</title>
      <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" key="viewport" />
      <meta name="theme-color" content="#ffffff" />
    </Head>
  )
}

/** Answers prefilled from the profile / auth metadata, then overlaid with the session draft. */
function initialState(userId, profile, user) {
  const p = profile || {}
  const meta = user?.user_metadata || {}
  const goals = parseChoices(GOAL_OPTIONS, p.goals)
  const interests = parseChoices(INTEREST_OPTIONS, p.interests)
  const base = {
    fullName: String(p.full_name || meta.full_name || meta.name || '').slice(0, NAME_MAX),
    level: LEVELS.includes(p.level) ? p.level : '',
    goals: goals.ids,
    goalsText: goals.text,
    interests: interests.ids,
    interestsText: interests.text,
  }
  const draft = loadDraft(userId)
  const answers = draft ? { ...draft.answers, fullName: draft.answers.fullName || base.fullName } : base
  // Never resume past a step that isn't complete
  const firstInvalid = stepValidity(answers).findIndex((ok) => !ok)
  let step = draft ? draft.step : STEPS.NAME
  if (firstInvalid !== -1 && firstInvalid < step) step = firstInvalid
  return { answers, step }
}

export default function OnboardingPage() {
  const router = useRouter()
  const { user, loading, signOut } = useAuth()
  const routerRef = useRef(router)
  routerRef.current = router
  const userRef = useRef(user)
  userRef.current = user
  const userId = user?.id

  const [ready, setReady] = useState(false)
  const [answers, setAnswers] = useState(EMPTY_ANSWERS)
  // dir: 'none' (initial/restore) | 'forward' | 'back' — drives the transition + heading focus
  const [nav, setNav] = useState({ step: STEPS.NAME, dir: 'none' })
  // Came from the summary's "Edit": Continue goes straight back to the summary
  const [editing, setEditing] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [signingOut, setSigningOut] = useState(false)

  const answersRef = useRef(answers)
  answersRef.current = answers
  const editingRef = useRef(editing)
  editingRef.current = editing
  const mountedRef = useRef(false)
  const controllersRef = useRef(new Set())
  const advanceTimerRef = useRef(null)
  const submittingRef = useRef(false)
  const deletingRef = useRef(false)
  const finishedRef = useRef(false) // stop saving the draft once submitted / deleted / signed out
  const deleteBtnRef = useRef(null)

  useEffect(() => {
    mountedRef.current = true
    const controllers = controllersRef.current
    return () => {
      mountedRef.current = false
      clearTimeout(advanceTimerRef.current)
      controllers.forEach((c) => c.abort())
      controllers.clear()
    }
  }, [])

  const newController = () => {
    const controller = new AbortController()
    controllersRef.current.add(controller)
    return controller
  }

  // Who am I? Teacher → /teacher; already onboarded → /student; else prefill + restore draft.
  useEffect(() => {
    if (loading) return
    const currentUser = userRef.current
    if (!userId || !currentUser) {
      routerRef.current.replace('/login')
      return
    }
    const controller = new AbortController()
    const start = (profile) => {
      const initial = initialState(userId, profile, currentUser)
      setAnswers(initial.answers)
      setNav({ step: initial.step, dir: 'none' })
      setReady(true)
    }
    api('/api/me', { signal: controller.signal })
      .then((me) => {
        if (controller.signal.aborted) return
        if (me?.role === 'teacher') {
          routerRef.current.replace('/teacher')
          return
        }
        if (me?.profile?.onboarded_at) {
          clearDraft(userId)
          routerRef.current.replace('/student')
          return
        }
        start(me?.profile)
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || controller.signal.aborted) return
        // Show the flow anyway; submitting will surface any real problem
        start(null)
      })
    return () => controller.abort()
    // Only once per signed-in user (token refreshes must not reset the flow)
  }, [loading, userId])

  // Keep in-progress answers across refreshes
  useEffect(() => {
    if (!ready || finishedRef.current) return
    saveDraft(userId, answers, nav.step)
  }, [ready, userId, answers, nav.step])

  // New step: start at the top (the heading takes focus with preventScroll)
  useEffect(() => {
    if (nav.dir === 'none') return
    if (window.scrollY > 0) window.scrollTo(0, 0)
  }, [nav])

  const goTo = useCallback((step, dir) => {
    clearTimeout(advanceTimerRef.current)
    setError('')
    setNav({ step, dir })
  }, [])

  const setField = useCallback((key, value) => {
    setAnswers((a) => ({ ...a, [key]: value }))
  }, [])

  const toggle = useCallback((key, id) => {
    setAnswers((a) => {
      const list = a[key]
      return { ...a, [key]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id] }
    })
  }, [])

  /** Step after `step`: the summary when editing from it (and everything is valid). */
  const nextStep = (step, current) => {
    if (editingRef.current && stepValidity(current)[STEPS.SUMMARY]) return STEPS.SUMMARY
    return Math.min(step + 1, STEPS.SUMMARY)
  }

  const advanceFrom = (step) => {
    const next = nextStep(step, answersRef.current)
    if (next === STEPS.SUMMARY) setEditing(false)
    goTo(next, 'forward')
  }

  const submit = async () => {
    if (submittingRef.current || deletingRef.current) return
    const current = answersRef.current
    const validity = stepValidity(current)
    if (!validity[STEPS.SUMMARY]) {
      goTo(validity.findIndex((ok) => !ok), 'back')
      return
    }
    submittingRef.current = true
    setSubmitting(true)
    setError('')
    const controller = newController()
    try {
      await api('/api/onboarding/complete', {
        method: 'POST',
        body: toPayload(current),
        signal: controller.signal,
      })
      finishedRef.current = true
      clearDraft(userId)
      if (!mountedRef.current) return
      setDone(true)
      // Full reload so every page sees the fresh profile
      window.location.href = '/student'
    } catch (err) {
      if (err?.name === 'AbortError' || !mountedRef.current) return
      submittingRef.current = false
      setSubmitting(false)
      setError(err?.message || 'Something went wrong. Please try again.')
    } finally {
      controllersRef.current.delete(controller)
    }
  }

  const handleContinue = () => {
    const step = nav.step
    if (step === STEPS.SUMMARY) {
      submit()
      return
    }
    if (submittingRef.current || deletingRef.current) return
    if (!stepValidity(answersRef.current)[step]) return
    advanceFrom(step)
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    handleContinue()
  }

  // Enter on a radio / checkbox continues too (text inputs submit natively,
  // textareas handle Enter themselves)
  const handleFormKeyDown = (e) => {
    if (e.key !== 'Enter' || e.defaultPrevented) return
    const t = e.target
    if (t?.tagName === 'INPUT' && (t.type === 'radio' || t.type === 'checkbox')) {
      e.preventDefault()
      handleContinue()
    }
  }

  const handleBack = () => {
    if (nav.step > STEPS.NAME) goTo(nav.step - 1, 'back')
  }

  const handleEdit = (step) => {
    setEditing(true)
    goTo(step, 'back')
  }

  // Pointer pick on a level card: select, then auto-advance shortly after
  const handleLevelPick = (code) => {
    setField('level', code)
    clearTimeout(advanceTimerRef.current)
    advanceTimerRef.current = setTimeout(() => {
      if (!mountedRef.current || submittingRef.current || deletingRef.current) return
      const next = nextStep(STEPS.LEVEL, { ...answersRef.current, level: code })
      if (next === STEPS.SUMMARY) setEditing(false)
      setError('')
      setNav((cur) => (cur.step === STEPS.LEVEL ? { step: next, dir: 'forward' } : cur))
    }, AUTO_ADVANCE_MS)
  }

  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    finishedRef.current = true
    clearDraft(userId)
    await signOut().catch(() => {})
    window.location.href = '/login'
  }

  const handleDelete = async () => {
    if (deletingRef.current || submittingRef.current) return
    deletingRef.current = true
    clearTimeout(advanceTimerRef.current)
    setDeleting(true)
    setDeleteError('')
    const controller = newController()
    try {
      await api('/api/student/deleteProfile', { method: 'POST', signal: controller.signal })
      finishedRef.current = true
      clearDraft(userId)
      await signOut().catch(() => {})
      window.location.href = '/login'
    } catch (err) {
      if (err?.name === 'AbortError' || !mountedRef.current) return
      deletingRef.current = false
      setDeleting(false)
      setDeleteError(err?.message || 'Could not delete your account. Please try again.')
    } finally {
      controllersRef.current.delete(controller)
    }
  }

  if (loading || !ready) {
    return (
      <>
        <PageHead />
        <OnboardingSkeleton />
      </>
    )
  }

  const step = nav.step
  const validity = stepValidity(answers)
  const busy = submitting || done || deleting || signingOut
  const autoFocus = nav.dir !== 'none'
  const interestsEmpty = !hasInterests(answers)
  const paneClass = nav.dir === 'forward' ? styles.enterForward : nav.dir === 'back' ? styles.enterBack : ''

  let content = null
  if (step === STEPS.NAME) {
    content = (
      <StepName value={answers.fullName} onChange={(v) => setField('fullName', v)} autoFocus={autoFocus} disabled={busy} />
    )
  } else if (step === STEPS.LEVEL) {
    content = (
      <StepLevel
        value={answers.level}
        onChange={(code) => setField('level', code)}
        onPick={handleLevelPick}
        autoFocus={autoFocus}
        disabled={busy}
      />
    )
  } else if (step === STEPS.GOALS) {
    content = (
      <StepGoals
        selected={answers.goals}
        text={answers.goalsText}
        onToggle={(id) => toggle('goals', id)}
        onTextChange={(v) => setField('goalsText', v)}
        onEnter={handleContinue}
        autoFocus={autoFocus}
        disabled={busy}
      />
    )
  } else if (step === STEPS.INTERESTS) {
    content = (
      <StepInterests
        selected={answers.interests}
        text={answers.interestsText}
        onToggle={(id) => toggle('interests', id)}
        onTextChange={(v) => setField('interestsText', v)}
        onEnter={handleContinue}
        autoFocus={autoFocus}
        disabled={busy}
      />
    )
  } else {
    content = <StepSummary answers={answers} onEdit={handleEdit} autoFocus={autoFocus} disabled={busy} />
  }

  return (
    <>
      <PageHead />
      <OnboardingLayout
        header={<ProgressHeader step={step} total={STEP_COUNT} />}
        footer={
          <OnboardingFooter
            email={user?.email}
            onSignOut={handleSignOut}
            onDelete={() => {
              setDeleteError('')
              setConfirmOpen(true)
            }}
            deleteRef={deleteBtnRef}
            disabled={busy}
          />
        }
      >
        <p className="sr-only" aria-live="polite" aria-atomic="true">
          Step {step + 1} of {STEP_COUNT}
        </p>
        <form className={styles.form} onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} noValidate>
          <div className={styles.navRow}>
            {step > STEPS.NAME ? (
              <button type="button" className={styles.backButton} onClick={handleBack} disabled={busy}>
                <ArrowLeftIcon />
                Back
              </button>
            ) : null}
          </div>
          <div key={step} className={`${styles.pane} ${paneClass}`}>
            {content}
          </div>
          <StepActions
            step={step}
            canContinue={step === STEPS.INTERESTS ? !interestsEmpty : validity[step]}
            editing={editing}
            submitting={submitting}
            done={done}
            error={error}
            busy={busy}
            showSkip={step === STEPS.INTERESTS && interestsEmpty}
            onSkip={() => advanceFrom(STEPS.INTERESTS)}
          />
        </form>
      </OnboardingLayout>

      {confirmOpen ? (
        <ConfirmDialog
          title="Delete your account?"
          description="This permanently deletes your account and everything in it. You can sign up again later, but this can't be undone."
          cancelLabel="Keep my account"
          confirmLabel="Delete my account"
          busyLabel="Deleting…"
          busy={deleting}
          error={deleteError}
          danger
          onCancel={() => setConfirmOpen(false)}
          onConfirm={handleDelete}
          returnFocusRef={deleteBtnRef}
        />
      ) : null}
    </>
  )
}
