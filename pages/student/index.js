import { useEffect, useId, useMemo, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '@/components/AuthProvider'
import StudentShell from '@/components/student/StudentShell'
import UpNextCard, { UpNextSkeleton } from '@/components/student/home/UpNextCard'
import ProgressCard, { ProgressSkeleton } from '@/components/student/home/ProgressCard'
import { computeUpNext } from '@/components/student/home/upNext'
import LessonCard, { LessonCardSkeleton } from '@/components/student/lessons/LessonCard'
import { ErrorCard } from '@/components/student/lessons/StatusViews'
import { progressStats, scoreHistory, sortNewestFirst } from '@/components/student/lessons/progress'
import { levelShort } from '@/components/student/profile/levels'
import { plural } from '@/components/lesson/format'
import { api } from '@/utils/apiClient'
import { safeHttpsUrl } from '@/utils/lesson/schema'
import ui from '@/components/student/ui.module.css'
import styles from '@/components/student/home/Home.module.css'

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || ''
}

function MistakesCard({ count }) {
  return (
    <Link href="/student/review" className={styles.mistakes}>
      <span className={styles.mistakesIcon} aria-hidden="true">
        🎯
      </span>
      <span className={styles.mistakesText}>
        <span className={styles.mistakesTitle}>{plural(count, 'mistake')} to fix</span>
        <span className={styles.mistakesSub}>Turn them into wins in a quick review</span>
      </span>
      <span className={styles.chevron} aria-hidden="true">
        ›
      </span>
    </Link>
  )
}

function HowItWorks() {
  const steps = [
    { emoji: '🗣️', text: 'Take your class with Wael on Preply' },
    { emoji: '📝', text: 'Get a recap of everything you covered' },
    { emoji: '🎮', text: 'Practise with fun exercises' },
  ]
  return (
    <section className={`${ui.card} ${styles.how}`} aria-labelledby="how-title">
      <h2 id="how-title" className={styles.howTitle}>
        How it works
      </h2>
      <ol className={styles.howList}>
        {steps.map((s, i) => (
          <li key={i} className={styles.howStep}>
            <span className={styles.howEmoji} aria-hidden="true">
              {s.emoji}
            </span>
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default function StudentHome() {
  const router = useRouter()
  const { user } = useAuth()
  const recentId = useId()
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

  const lessons = useMemo(() => sortNewestFirst(state.data?.lessons), [state.data])
  const mistakeCount = Math.max(0, Number(state.data?.mistakeCount) || 0)
  const upNext = useMemo(() => computeUpNext(lessons, mistakeCount), [lessons, mistakeCount])
  const stats = useMemo(() => progressStats(lessons), [lessons])
  const history = useMemo(() => scoreHistory(lessons, 8), [lessons])

  const profile = state.me?.profile || null
  const first = firstName(profile?.full_name || user?.user_metadata?.full_name || user?.user_metadata?.name || '')
  const level = levelShort(profile?.level)
  const driveUrl = safeHttpsUrl(state.data?.driveFolderUrl)
  const loading = state.status === 'loading'
  const hasLessons = lessons.length > 0

  return (
    <StudentShell wide>
      <Head>
        <title>Home · Preply Lessons</title>
      </Head>

      <header className={styles.greeting}>
        {loading ? (
          <div>
            <h1 className="sr-only">Home</h1>
            <span className={ui.skel} style={{ width: 240, maxWidth: '80%', height: 34 }} aria-hidden="true" />
            <span className={ui.skel} style={{ width: 170, height: 28, marginTop: 10, borderRadius: 999 }} aria-hidden="true" />
          </div>
        ) : (
          <>
            <h1 className={styles.hello}>
              Bonjour{first ? `, ${first}` : ''}! <span aria-hidden="true">👋</span>
            </h1>
            <div className={styles.greetMeta}>
              {level && (
                <span className={`${ui.pill} ${styles.levelPill}`}>
                  <span aria-hidden="true">🇫🇷</span>
                  <span className="sr-only">Your French level: </span>
                  {level}
                </span>
              )}
              <span className={styles.tagline}>Ready for some French?</span>
            </div>
          </>
        )}
        {loading && <span className="sr-only" role="status">Loading your lessons…</span>}
      </header>

      {state.status === 'error' ? (
        <ErrorCard
          title="Couldn’t load your lessons"
          message={state.error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : (
        <div className={styles.layout}>
          <div className={styles.primary}>
            <div className={styles.oHero}>{loading ? <UpNextSkeleton /> : <UpNextCard upNext={upNext} />}</div>

            {!loading && mistakeCount > 0 && upNext.kind !== 'mistakes' && (
              <div className={styles.oMistakes}>
                <MistakesCard count={mistakeCount} />
              </div>
            )}

            {(loading || hasLessons) && (
              <section className={styles.oRecent} aria-labelledby={recentId} aria-busy={loading}>
                <div className={styles.sectionHead}>
                  <h2 id={recentId} className={`${ui.sectionTitle} ${styles.sectionTitle}`}>
                    Recent lessons
                  </h2>
                  <Link href="/student/lessons" className={styles.seeAll}>
                    See all lessons<span aria-hidden="true"> ›</span>
                  </Link>
                </div>
                <ul className={styles.list}>
                  {loading ? (
                    <>
                      <LessonCardSkeleton />
                      <LessonCardSkeleton />
                      <LessonCardSkeleton />
                    </>
                  ) : (
                    lessons.slice(0, 3).map((lesson, i) => <LessonCard key={lesson.id} lesson={lesson} index={i} />)
                  )}
                </ul>
              </section>
            )}
          </div>

          <div className={styles.aside}>
            {loading ? (
              <div className={styles.oProgress}>
                <ProgressSkeleton />
              </div>
            ) : hasLessons ? (
              <div className={styles.oProgress}>
                <ProgressCard stats={stats} history={history} />
              </div>
            ) : (
              <div className={styles.oProgress}>
                <HowItWorks />
              </div>
            )}

            {!loading && driveUrl && (
              <div className={styles.oDrive}>
                <a
                  href={driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${ui.btn} ${ui.ghost} ${ui.block}`}
                >
                  <span aria-hidden="true">📁</span> My Google Drive folder
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </StudentShell>
  )
}
