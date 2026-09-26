import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import AppShell from '@/components/AppShell'
import LessonView from '@/components/lesson/LessonView'
import ScoreRing from '@/components/lesson/ScoreRing'
import { formatLessonDate, plural } from '@/components/lesson/format'
import { api } from '@/utils/apiClient'
import { safeHttpsUrl } from '@/utils/lesson/schema'
import styles from '@/components/lesson/StudentPages.module.css'

const BACK = { href: '/student', label: 'My lessons' }

function LessonSkeleton() {
  return (
    <div aria-hidden="true">
      <span className={styles.skel} style={{ width: '40%', height: 14, marginBottom: 20 }} />
      <span className={styles.skel} style={{ width: '100%', height: 84, borderRadius: 16, marginBottom: 20 }} />
      <span className={styles.skel} style={{ width: '100%', height: 180, borderRadius: 16, marginBottom: 20 }} />
      <span className={styles.skel} style={{ width: '100%', height: 240, borderRadius: 16 }} />
    </div>
  )
}

export default function StudentLessonPage() {
  const router = useRouter()
  const id = router.isReady && typeof router.query.id === 'string' ? router.query.id : null
  const [state, setState] = useState({ status: 'loading', lesson: null, progress: null, error: '' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    const { signal } = controller
    setState({ status: 'loading', lesson: null, progress: null, error: '' })

    api(`/api/student/lessons/${encodeURIComponent(id)}`, { signal })
      .then(({ lesson, progress }) => {
        if (signal.aborted) return
        if (!lesson) setState({ status: 'notfound', lesson: null, progress: null, error: '' })
        else setState({ status: 'ready', lesson, progress: progress || null, error: '' })
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || signal.aborted) return
        if (err?.status === 404 || err?.status === 400) {
          setState({ status: 'notfound', lesson: null, progress: null, error: '' })
        } else {
          setState({ status: 'error', lesson: null, progress: null, error: err?.message || 'Something went wrong.' })
        }
      })

    return () => controller.abort()
  }, [id, reloadKey])

  if (state.status === 'notfound') {
    return (
      <AppShell back={BACK}>
        <Head>
          <title>Lesson not found · Preply Lessons</title>
        </Head>
        <div className="dashboard-section">
          <div className="empty-state">
            <div className="empty-state-icon" aria-hidden="true">🔎</div>
            <h1 className="empty-state-title">Lesson not found</h1>
            <p className="empty-state-text">This lesson doesn&apos;t exist or isn&apos;t available anymore.</p>
            <Link href="/student" className="btn btn-primary" style={{ marginTop: '1.25rem', minHeight: 44 }}>
              Back to my lessons
            </Link>
          </div>
        </div>
      </AppShell>
    )
  }

  if (state.status === 'error') {
    return (
      <AppShell back={BACK}>
        <div className={`alert alert-error ${styles.errorBox}`} role="alert">
          <span>Couldn&apos;t load this lesson. {state.error}</span>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReloadKey((k) => k + 1)}>
            Try again
          </button>
        </div>
      </AppShell>
    )
  }

  if (state.status !== 'ready') {
    return (
      <AppShell back={BACK}>
        <LessonSkeleton />
      </AppShell>
    )
  }

  const { lesson, progress } = state
  const exerciseCount = Array.isArray(lesson.exercises) ? lesson.exercises.length : 0
  const driveUrl = safeHttpsUrl(lesson.drive_url)
  const date = formatLessonDate(lesson.lesson_date, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
  const hasBest = progress && Number.isFinite(progress.best_score) && Number(progress.best_total) > 0
  const practiceHref = `/student/lessons/${encodeURIComponent(lesson.id)}/practice`
  const title = lesson.title || lesson.content?.title || 'Lesson recap'

  return (
    <AppShell
      back={BACK}
      title={title}
      actions={
        <>
          <button
            type="button"
            className={`btn btn-secondary no-print ${styles.secondaryAction}`}
            onClick={() => window.print()}
          >
            <span aria-hidden="true">🖨️</span> Save as PDF
          </button>
          {driveUrl && (
            <a
              href={driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`btn btn-secondary no-print ${styles.secondaryAction}`}
            >
              <span aria-hidden="true">📁</span> Open in Google Drive
            </a>
          )}
        </>
      }
    >
      <Head>
        <title>{`${title} · Preply Lessons`}</title>
      </Head>

      <div className={exerciseCount > 0 ? styles.withCta : undefined}>
        <p className={styles.lessonMeta}>
          {date && <time dateTime={lesson.lesson_date}>{date}</time>}
          {hasBest && (
            <>
              <span aria-hidden="true">·</span>
              <span>
                Best score {progress.best_score}/{progress.best_total}
                {Number(progress.attempts) > 0 && ` (${plural(Number(progress.attempts), 'attempt')})`}
              </span>
            </>
          )}
        </p>

        {exerciseCount > 0 && (
          <div className={`${styles.ctaBar} no-print`}>
            <div className={styles.ctaText}>
              <span className={styles.ctaTitle}>
                {hasBest ? 'Practise again to beat your best' : 'Ready to practise?'}
              </span>
              <span className={styles.ctaSub}>
                {hasBest ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <ScoreRing score={progress.best_score} total={progress.best_total} size={36} />
                    Best: {progress.best_score}/{progress.best_total}
                  </span>
                ) : (
                  'Quick exercises based on this lesson.'
                )}
              </span>
            </div>
            <Link href={practiceHref} className={`btn btn-primary btn-lg ${styles.ctaBtn}`}>
              Practice ({plural(exerciseCount, 'exercise')})
            </Link>
          </div>
        )}

        <LessonView content={lesson.content} />
      </div>
    </AppShell>
  )
}
