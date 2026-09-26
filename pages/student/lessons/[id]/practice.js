import { useCallback, useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import PracticePlayer from '@/components/practice/PracticePlayer'
import { api } from '@/utils/apiClient'
import LoadingScreen from '@/components/ui/LoadingScreen'
import ui from '@/components/ui/ui.module.css'

// Full-screen practice (no shell). The player only mounts after the lesson
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

      {state.status === 'loading' && <LoadingScreen message="Loading exercises…" />}

      {state.status === 'notfound' && (
        <MessageCard icon="🔎" title="Lesson not found" text="This lesson doesn't exist or isn't available anymore.">
          <Link href="/student" className={`${ui.btn} ${ui.green} ${ui.block}`}>
            Back to my lessons
          </Link>
        </MessageCard>
      )}

      {state.status === 'error' && (
        <MessageCard icon="😕" title="Couldn't load the exercises" text={state.error} alert>
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
        <div style={{ fontSize: '3rem' }} aria-hidden="true">
          {icon}
        </div>
        <h1 style={{ margin: '0.5rem 0', fontSize: '1.4rem', fontWeight: 900 }}>{title}</h1>
        <p style={{ margin: '0 0 1.25rem', color: 'var(--st-ink-soft)' }}>{text}</p>
        <div style={{ display: 'grid', gap: '0.75rem' }}>{children}</div>
      </div>
    </div>
  )
}
