import { useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import PracticePlayer from '@/components/practice/PracticePlayer'
import { api } from '@/utils/apiClient'

// Full-screen practice (no AppShell). The player only mounts after the lesson
// has been fetched in the browser, so it never renders on the server.
export default function StudentPracticePage() {
  const router = useRouter()
  const id = router.isReady && typeof router.query.id === 'string' ? router.query.id : null
  const [state, setState] = useState({ status: 'loading', lesson: null, error: '' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    const { signal } = controller
    setState({ status: 'loading', lesson: null, error: '' })

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

  const lessonHref = id ? `/student/lessons/${encodeURIComponent(id)}` : '/student'

  // Server re-grades; resolves to { score, total, bestScore }. Not aborted on
  // unmount on purpose: the score should still be saved if the student leaves.
  const onComplete = useCallback(
    (answers) =>
      api(`/api/student/lessons/${encodeURIComponent(id)}/practice`, {
        method: 'POST',
        body: { answers },
      }),
    [id]
  )

  const onExit = useCallback(() => {
    router.replace(lessonHref)
  }, [router, lessonHref])

  const title = state.lesson?.title ? `Practice · ${state.lesson.title}` : 'Practice'

  return (
    <main>
      <Head>
        <title>{`${title} · Preply Lessons`}</title>
      </Head>

      {state.status === 'ready' && (
        <PracticePlayer exercises={state.lesson.exercises} onComplete={onComplete} onExit={onExit} />
      )}

      {state.status === 'loading' && (
        <div className="loading-screen" role="status">
          <div className="spinner spinner-lg" aria-hidden="true" />
          <span className="sr-only">Loading exercises…</span>
        </div>
      )}

      {state.status === 'notfound' && (
        <div className="loading-screen">
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">🔎</div>
            <h1 className="empty-state-title">Lesson not found</h1>
            <p className="empty-state-text">This lesson doesn&apos;t exist or isn&apos;t available anymore.</p>
            <Link href="/student" className="btn btn-primary" style={{ marginTop: '1.25rem', minHeight: 44 }}>
              Back to my lessons
            </Link>
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="loading-screen" style={{ padding: '1rem' }}>
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">⚠️</div>
            <h1 className="empty-state-title">Couldn&apos;t load the exercises</h1>
            <p className="empty-state-text">{state.error}</p>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1.25rem' }}>
              <Link href={lessonHref} className="btn btn-secondary" style={{ minHeight: 44 }}>
                Back to lesson
              </Link>
              <button
                type="button"
                className="btn btn-primary"
                style={{ minHeight: 44 }}
                onClick={() => setReloadKey((k) => k + 1)}
              >
                Try again
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
