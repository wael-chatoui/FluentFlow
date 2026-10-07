import { useCallback, useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import PracticePlayer from '@/components/practice/PracticePlayer'
import { clearSnapshot } from '@/components/practice/runState'
import useMe from '@/components/student/useMe'
import { invalidateLessons, recordPractice } from '@/components/student/useLessons'
import { api } from '@/utils/apiClient'
import LoadingScreen from '@/components/ui/LoadingScreen'
import ui from '@/components/ui/ui.module.css'
import { Ban, CircleAlert, SearchX } from 'lucide-react'
import Icon from '@/components/ui/Icon'

// Leaving the end screen waits this long at most for the score to be saved, so the
// lesson page shows the new best score (the save keeps going in the background anyway)
const SAVE_WAIT_MS = 4000

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

// True when this page was reached by an in-app navigation, so the previous history entry
// is ours. False when it was the first page of the tab's visit (reload, new tab, link
// pasted from elsewhere): going back could then leave the app.
function openedInApp() {
  try {
    const entry = performance.getEntriesByType('navigation')[0]
    return Boolean(entry) && new URL(entry.name).pathname !== window.location.pathname && window.history.length > 1
  } catch {
    return false
  }
}

// Full-screen practice (no shell). The player only mounts after the lesson
// has been fetched in the browser, so it never renders on the server.
export default function StudentPracticePage() {
  const router = useRouter()
  useMe() // onboarding / role redirects (this page has no StudentShell)
  const id = router.isReady && typeof router.query.id === 'string' ? router.query.id : null
  const fromLesson = router.query.from === 'lesson'
  const [state, setState] = useState({ status: 'loading', lesson: null, error: '' })
  const [reloadKey, setReloadKey] = useState(0)
  const [waiting, setWaiting] = useState(false) // leaving: waiting for the pending save first
  const savingRef = useRef(null) // pending POST, awaited before leaving
  const leavingRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    const { signal } = controller
    setState({ status: 'loading', lesson: null, error: '' })
    // A fresh load (Restart, or another lesson in this page instance after a history jump)
    leavingRef.current = false
    setWaiting(false)

    api(`/api/student/lessons/${encodeURIComponent(id)}`, { signal })
      .then(({ lesson }) => {
        if (signal.aborted) return
        setState(lesson ? { status: 'ready', lesson, error: '' } : { status: 'notfound', lesson: null, error: '' })
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || signal.aborted) return
        if (err?.status === 404 || err?.status === 400) setState({ status: 'notfound', lesson: null, error: '' })
        else setState({ status: 'error', lesson: null, error: err?.message || 'Something went wrong.' })
      })

    return () => controller.abort()
  }, [id, reloadKey])

  const lessonHref = id ? `/student/lessons/${encodeURIComponent(id)}` : '/student/lessons'
  const lessonId = state.lesson?.id
  const version = state.lesson?.version ?? ''

  // Server re-grades; resolves to { score, total, bestScore, bestTotal, duplicate? }. May throw
  // ApiError code 'lesson_updated' (the player then offers to restart) or 'lesson_unavailable'
  // (hidden or deleted meanwhile: this page says so instead of a Retry that can never work).
  // Not aborted on unmount on purpose: the score should still be saved if the student leaves.
  const onComplete = useCallback(
    (answers, { runId } = {}) => {
      const request = api(`/api/student/lessons/${encodeURIComponent(lessonId)}/practice`, {
        method: 'POST',
        body: { answers, version, runId },
      })
      savingRef.current = request
      request.then(
        (result) => recordPractice(lessonId, result),
        (err) => {
          if (err?.code === 'lesson_updated') invalidateLessons()
          if (err?.code === 'lesson_unavailable') {
            invalidateLessons()
            clearSnapshot(`lesson:${lessonId}:${version}`) // the player's resumeKey: never resumable
            if (mountedRef.current && !leavingRef.current) setState({ status: 'unavailable', lesson: null, error: '' })
          }
        }
      )
      const settle = () => {
        if (savingRef.current === request) savingRef.current = null
      }
      request.then(settle, settle)
      return request
    },
    [lessonId, version]
  )

  // "Restart" after the teacher updated the lesson: load the new version
  const onRestart = useCallback(() => setReloadKey((k) => k + 1), [])

  const onExit = useCallback(async () => {
    if (leavingRef.current) return
    leavingRef.current = true
    const pending = savingRef.current
    if (pending) {
      const here = window.location.href
      setWaiting(true) // the tap visibly does something while the score is being saved
      await Promise.race([pending.catch(() => null), wait(SAVE_WAIT_MS)])
      // Meanwhile the student left by themselves (e.g. the browser's back button): stay there
      if (!mountedRef.current || window.location.href !== here) return
    }
    // Came from the lesson page: go back to it instead of stacking a second copy in history
    if (fromLesson && openedInApp()) router.back()
    else router.replace(lessonHref)
  }, [router, lessonHref, fromLesson])

  const title = state.lesson?.title ? `Practice · ${state.lesson.title}` : 'Practice'

  return (
    <main>
      <Head>
        <title>{`${title} · Preply Lessons`}</title>
      </Head>

      {waiting && <LoadingScreen message="Saving your score…" />}

      {!waiting && state.status === 'ready' && (
        <PracticePlayer
          key={`${state.lesson.id}:${version}`}
          exercises={state.lesson.exercises}
          title={state.lesson.title || 'Practice'}
          lessonId={state.lesson.id}
          onComplete={onComplete}
          onRestart={onRestart}
          onExit={onExit}
          resumeKey={`lesson:${state.lesson.id}:${version}`}
        />
      )}

      {state.status === 'loading' && (
        <>
          <h1 className="sr-only">Practice</h1>
          <LoadingScreen message="Loading exercises…" />
        </>
      )}

      {state.status === 'unavailable' && (
        <MessageCard
          icon={Ban}
          title="This lesson isn’t available anymore"
          text="Your teacher took it down while you were practicing, so this run couldn’t be saved."
          alert
        >
          <Link href="/student/lessons" className={`${ui.btn} ${ui.green} ${ui.block}`}>
            Back to my lessons
          </Link>
        </MessageCard>
      )}

      {state.status === 'notfound' && (
        <MessageCard icon={SearchX} title="Lesson not found" text="This lesson doesn’t exist or isn’t available anymore.">
          <Link href="/student/lessons" className={`${ui.btn} ${ui.green} ${ui.block}`}>
            Back to my lessons
          </Link>
        </MessageCard>
      )}

      {state.status === 'error' && (
        <MessageCard icon={CircleAlert} title="Couldn’t load the exercises" text={state.error} alert>
          <button type="button" className={`${ui.btn} ${ui.green} ${ui.block}`} onClick={() => setReloadKey((k) => k + 1)}>
            Try again
          </button>
          <Link href={lessonHref} className={`${ui.btn} ${ui.ghost} ${ui.block}`}>
            Back to lesson
          </Link>
        </MessageCard>
      )}
    </main>
  )
}

function MessageCard({ icon, title, text, alert = false, children }) {
  return (
    <div className={ui.theme} style={{ display: 'grid', placeItems: 'center', padding: '1rem' }}>
      <div className={ui.card} style={{ width: '100%', maxWidth: 420, textAlign: 'center' }} role={alert ? 'alert' : undefined}>
        <div
          style={{
            display: 'grid',
            placeItems: 'center',
            width: 72,
            height: 72,
            margin: '0 auto',
            borderRadius: '50%',
            background: alert ? 'var(--st-red-bg)' : 'var(--st-blue-bg)',
            color: alert ? 'var(--st-red-ink)' : 'var(--st-blue-ink)',
          }}
          aria-hidden="true"
        >
          <Icon icon={icon} size={36} />
        </div>
        <h1 style={{ margin: '0.5rem 0', fontSize: '1.4rem', fontWeight: 900 }}>{title}</h1>
        <p style={{ margin: '0 0 1.25rem', color: 'var(--st-ink-soft)' }}>{text}</p>
        <div style={{ display: 'grid', gap: '0.75rem' }}>{children}</div>
      </div>
    </div>
  )
}
