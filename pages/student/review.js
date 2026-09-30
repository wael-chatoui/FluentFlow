import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Head from 'next/head'
import StudentShell from '@/components/student/StudentShell'
import ReviewIntro from '@/components/student/review/ReviewIntro'
import PracticePlayer from '@/components/practice/PracticePlayer'
import { playableExercises } from '@/components/practice/utils'
import { reviewResult, reviewSavedText } from '@/components/student/review/result'
import { setMistakeCount } from '@/components/student/useLessons'
import { api } from '@/utils/apiClient'

const REVIEW_LABELS = { exit: 'Done', restart: null, saved: reviewSavedText }

// Mistakes review: intro inside StudentShell, then the full-screen practice
// player with the mistakes of every lesson. The player only mounts after a
// click (data fetched in the browser), so it never renders on the server.
export default function StudentReviewPage() {
  const [state, setState] = useState({ status: 'loading', exercises: [], total: 0, error: '' })
  const [reloadKey, setReloadKey] = useState(0)
  const [session, setSession] = useState(null) // { id, exercises } while playing
  const [lastResult, setLastResult] = useState(null) // { score, total, remaining, skipped } of the last round
  // The last round's answers when its save failed after the player was closed: { body, error, retrying }
  const [unsaved, setUnsaved] = useState(null)

  const mountedRef = useRef(true)
  const savingRef = useRef(null) // pending POST, so the refetch sees its result
  const playingRef = useRef(false)
  const lastSaveRef = useRef(null) // { body, error } of the round's latest save until it succeeds

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

    Promise.resolve(savingRef.current)
      .catch(() => null)
      .then(() => api('/api/student/review', { signal }))
      .then((data) => {
        if (signal.aborted) return
        const exercises = Array.isArray(data?.exercises) ? data.exercises : []
        const total = Number.isFinite(data?.total) ? data.total : exercises.length
        setMistakeCount(total)
        setState({ status: 'ready', exercises, total, error: '' })
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || signal.aborted) return
        setState({ status: 'error', exercises: [], total: 0, error: err?.message || 'Something went wrong.' })
      })

    return () => controller.abort()
  }, [reloadKey])

  // Only what the player can actually render, so the count matches the round
  const exercises = useMemo(() => playableExercises(state.exercises), [state.exercises])

  const start = useCallback(() => {
    if (!exercises.length) return
    // A new round replays the same mistakes: an unsaved previous round is dropped (saving it
    // afterwards would record its older answers over the new ones)
    lastSaveRef.current = null
    setUnsaved(null)
    setLastResult(null)
    playingRef.current = true
    setSession((s) => s || { id: Date.now(), exercises })
  }, [exercises])

  // Saves one round; resolves to reviewResult(). Not aborted on unmount on purpose: the answers
  // should still be saved if the student leaves. While the player is open it shows (and
  // retries) a failed save; once it is closed this page does, so no round is lost silently.
  const save = useCallback((body) => {
    const attempt = { body, error: '' }
    lastSaveRef.current = attempt
    const request = api('/api/student/review', { method: 'POST', body }).then((res) => {
      const result = reviewResult(res)
      setMistakeCount(result.remaining)
      if (lastSaveRef.current === attempt) lastSaveRef.current = null
      if (mountedRef.current) {
        setLastResult(result)
        setUnsaved(null)
      }
      return result
    })
    request.catch((err) => {
      attempt.error = err?.message || 'Please try again.'
      if (!playingRef.current && lastSaveRef.current === attempt && mountedRef.current) {
        setUnsaved({ body, error: attempt.error, retrying: false })
      }
    })
    savingRef.current = request
    const settle = () => {
      if (savingRef.current === request) savingRef.current = null
    }
    request.then(settle, settle)
    return request
  }, [])

  // Each answer carries the version of its lesson, so answers to exercises the teacher
  // replaced in the meantime are skipped instead of graded against the new ones.
  const onComplete = useCallback(
    (answers) => {
      const versions = new Map((session?.exercises || []).map((e) => [e.id, e.version]))
      return save({
        answers: answers.map((a) => {
          const version = versions.get(a.exerciseId)
          return typeof version === 'string' ? { ...a, version } : a
        }),
      })
    },
    [session, save]
  )

  const onExit = useCallback(() => {
    playingRef.current = false
    // Left although the save failed (or while it is still running: see save())
    const last = lastSaveRef.current
    if (last?.error) setUnsaved({ body: last.body, error: last.error, retrying: false })
    setSession(null)
    setReloadKey((k) => k + 1)
    if (typeof window !== 'undefined') window.scrollTo(0, 0)
  }, [])

  const retryUnsaved = () => {
    if (!unsaved || unsaved.retrying) return
    setUnsaved({ ...unsaved, retrying: true })
    // A failure puts the banner back with the new error (save())
    save(unsaved.body).then(
      () => mountedRef.current && setReloadKey((k) => k + 1),
      () => {}
    )
  }

  const discardUnsaved = () => {
    lastSaveRef.current = null
    setUnsaved(null)
  }

  if (session) {
    return (
      <main>
        <Head>
          <title>Review · Preply Lessons</title>
        </Head>
        <PracticePlayer
          key={session.id}
          exercises={session.exercises}
          title="Review"
          onComplete={onComplete}
          onExit={onExit}
          labels={REVIEW_LABELS}
        />
      </main>
    )
  }

  return (
    <StudentShell>
      <Head>
        <title>Review · Preply Lessons</title>
      </Head>
      <ReviewIntro
        status={state.status}
        exercises={exercises}
        total={state.total}
        error={state.error}
        lastResult={lastResult}
        unsaved={unsaved}
        onStart={start}
        onRetry={() => setReloadKey((k) => k + 1)}
        onRetrySave={retryUnsaved}
        onDiscardSave={discardUnsaved}
      />
    </StudentShell>
  )
}
