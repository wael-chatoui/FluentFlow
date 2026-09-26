import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Head from 'next/head'
import StudentShell from '@/components/student/StudentShell'
import ReviewIntro from '@/components/student/review/ReviewIntro'
import PracticePlayer from '@/components/practice/PracticePlayer'
import { playableExercises } from '@/components/practice/utils'
import { api } from '@/utils/apiClient'

function reviewSavedText(result) {
  const n = Number(result?.remaining)
  if (!Number.isFinite(n)) return 'Progress saved'
  if (n === 0) return 'Saved · No mistakes left!'
  return `Saved · ${n} ${n === 1 ? 'mistake' : 'mistakes'} left to fix`
}

const REVIEW_LABELS = { exit: 'Done', restart: null, saved: reviewSavedText }

// Mistakes review: intro inside StudentShell, then the full-screen practice
// player with the mistakes of every lesson. The player only mounts after a
// click (data fetched in the browser), so it never renders on the server.
export default function StudentReviewPage() {
  const [state, setState] = useState({ status: 'loading', exercises: [], error: '' })
  const [reloadKey, setReloadKey] = useState(0)
  const [session, setSession] = useState(null) // { id, exercises } while playing
  const [lastResult, setLastResult] = useState(null) // { score, total, remaining } of the last round

  const mountedRef = useRef(true)
  const savingRef = useRef(null) // pending POST, so the refetch sees its result

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
        setState({ status: 'ready', exercises: Array.isArray(data?.exercises) ? data.exercises : [], error: '' })
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || signal.aborted) return
        setState({ status: 'error', exercises: [], error: err?.message || 'Something went wrong.' })
      })

    return () => controller.abort()
  }, [reloadKey])

  // Only what the player can actually render, so the count matches the round
  const exercises = useMemo(() => playableExercises(state.exercises), [state.exercises])

  const start = useCallback(() => {
    if (!exercises.length) return
    setLastResult(null)
    setSession((s) => s || { id: Date.now(), exercises })
  }, [exercises])

  // Server re-grades; resolves to { score, total, remaining }. Not aborted on
  // unmount on purpose: the answers should still be saved if the student leaves.
  const onComplete = useCallback((answers) => {
    const request = api('/api/student/review', { method: 'POST', body: { answers } }).then((res) => {
      const result = {
        score: Number(res?.score),
        total: Number(res?.total),
        remaining: Number(res?.remaining),
      }
      if (mountedRef.current) setLastResult(result)
      return result
    })
    savingRef.current = request
    request
      .catch(() => null)
      .then(() => {
        if (savingRef.current === request) savingRef.current = null
      })
    return request
  }, [])

  const onExit = useCallback(() => {
    setSession(null)
    setReloadKey((k) => k + 1)
    if (typeof window !== 'undefined') window.scrollTo(0, 0)
  }, [])

  if (session) {
    return (
      <main>
        <Head>
          <title>Review · Preply Lessons</title>
        </Head>
        <PracticePlayer
          key={session.id}
          exercises={session.exercises}
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
        error={state.error}
        lastResult={lastResult}
        onStart={start}
        onRetry={() => setReloadKey((k) => k + 1)}
      />
    </StudentShell>
  )
}
