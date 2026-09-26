import { useEffect, useMemo, useRef, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import AppShell from '@/components/AppShell'
import { useAuth } from '@/components/AuthProvider'
import LessonCard, { LessonCardSkeleton } from '@/components/lesson/LessonCard'
import { percent } from '@/components/lesson/format'
import { api } from '@/utils/apiClient'
import { safeHttpsUrl } from '@/utils/lesson/schema'
import styles from '@/components/lesson/StudentPages.module.css'

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || ''
}

export default function StudentHome() {
  const router = useRouter()
  const { user } = useAuth()
  const [state, setState] = useState({ status: 'loading', me: null, data: null, error: '' })
  const [reloadKey, setReloadKey] = useState(0)
  const routerRef = useRef(router)
  routerRef.current = router

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    setState((s) => ({ ...s, status: 'loading', error: '' }))

    Promise.all([api('/api/me', { signal }), api('/api/student/lessons', { signal })])
      .then(([me, data]) => {
        if (signal.aborted) return
        if (me?.role === 'teacher') {
          routerRef.current.replace('/teacher')
          return
        }
        if (!me?.profile?.onboarded_at) {
          routerRef.current.replace('/onboarding')
          return
        }
        setState({ status: 'ready', me, data, error: '' })
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || signal.aborted) return
        setState({ status: 'error', me: null, data: null, error: err?.message || 'Something went wrong.' })
      })

    return () => controller.abort()
  }, [reloadKey])

  const lessons = useMemo(() => {
    const list = Array.isArray(state.data?.lessons) ? [...state.data.lessons] : []
    // Newest first (the API already sorts; stable sort keeps its order on ties)
    return list.sort((a, b) => String(b.lesson_date || '').localeCompare(String(a.lesson_date || '')))
  }, [state.data])

  const stats = useMemo(() => {
    const practised = lessons.filter((l) => Number(l.attempts) > 0 && Number(l.best_total) > 0)
    const pcts = practised.map((l) => percent(Number(l.best_score), Number(l.best_total))).filter((p) => p !== null)
    const avg = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null
    return { total: lessons.length, practised: practised.length, avg }
  }, [lessons])

  const name =
    state.me?.profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || ''
  const first = firstName(name)
  const driveUrl = safeHttpsUrl(state.data?.driveFolderUrl)
  const loading = state.status === 'loading'

  return (
    <>
      <Head>
        <title>My lessons · Preply Lessons</title>
      </Head>
      <AppShell
        title={first ? `Hi, ${first} 👋` : 'Hi 👋'}
        actions={
          driveUrl ? (
            <a
              href={driveUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`btn btn-secondary ${styles.driveBtn}`}
            >
              <span aria-hidden="true">📁</span> My Google Drive folder
            </a>
          ) : null
        }
      >
        <p className={styles.subtitle}>Your lesson recaps and exercises from your classes with Wael.</p>

        {state.status === 'error' ? (
          <div className={`alert alert-error ${styles.errorBox}`} role="alert">
            <span>Couldn&apos;t load your lessons. {state.error}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </button>
          </div>
        ) : (
          <>
            <div className="stats-row" aria-busy={loading}>
              <div className="stat-card">
                {loading ? (
                  <StatSkeleton />
                ) : (
                  <>
                    <div className="stat-value">{stats.total}</div>
                    <div className="stat-label">{stats.total === 1 ? 'Lesson' : 'Lessons'}</div>
                  </>
                )}
              </div>
              <div className="stat-card">
                {loading ? (
                  <StatSkeleton />
                ) : (
                  <>
                    <div className="stat-value">{stats.practised}</div>
                    <div className="stat-label">Practised</div>
                  </>
                )}
              </div>
              <div className="stat-card">
                {loading ? (
                  <StatSkeleton />
                ) : (
                  <>
                    <div className={`stat-value ${stats.avg === null ? styles.statValueMuted : ''}`}>
                      {stats.avg === null ? '—' : `${stats.avg}%`}
                    </div>
                    <div className="stat-label">Average best score</div>
                  </>
                )}
              </div>
            </div>

            <div className={styles.listHeader}>
              <h2 className={styles.listTitle}>My lessons</h2>
            </div>

            {loading ? (
              <ul className={styles.lessonList} aria-label="Loading lessons">
                <LessonCardSkeleton />
                <LessonCardSkeleton />
                <LessonCardSkeleton />
              </ul>
            ) : lessons.length === 0 ? (
              <div className="dashboard-section">
                <div className="empty-state">
                  <div className="empty-state-icon" aria-hidden="true">📚</div>
                  <div className="empty-state-title">No lessons yet</div>
                  <div className="empty-state-text">
                    Your first lesson recap will appear here after your next class with Wael.
                  </div>
                </div>
              </div>
            ) : (
              <ul className={styles.lessonList}>
                {lessons.map((lesson) => (
                  <LessonCard key={lesson.id} lesson={lesson} />
                ))}
              </ul>
            )}
          </>
        )}
      </AppShell>
    </>
  )
}

function StatSkeleton() {
  return (
    <div className={styles.statSkeleton} aria-hidden="true">
      <span className={styles.skel} style={{ width: 40, height: 28 }} />
      <span className={styles.skel} style={{ width: 70, height: 12 }} />
    </div>
  )
}
