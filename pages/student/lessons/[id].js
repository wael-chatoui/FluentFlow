import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import StudentShell from '@/components/student/StudentShell'
import useMe from '@/components/student/useMe'
import LessonView from '@/components/lesson/LessonView'
import MasteryRing from '@/components/student/lessons/MasteryRing'
import { EmptyState, ErrorCard } from '@/components/student/lessons/StatusViews'
import { lessonEmoji, timeAgo } from '@/components/student/lessons/progress'
import { accentStyle } from '@/components/ui/accents'
import { formatLessonDate, percent, plural } from '@/components/lesson/format'
import { api } from '@/utils/apiClient'
import { safeHttpsUrl } from '@/utils/lesson/schema'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/student/lessons/LessonPage.module.css'

const DATE_OPTS = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }
const HEADER_OFFSET = 80 // sticky top bar + breathing room, for #section links

const hasItems = (value) => Array.isArray(value) && value.length > 0

function BackLink() {
  return (
    <Link href="/student/lessons" className={`${styles.back} no-print`}>
      <span aria-hidden="true">‹</span> My lessons
    </Link>
  )
}

function LessonSkeleton() {
  return (
    <div aria-hidden="true">
      <div className={`${styles.header} ${styles.headerSkeleton}`}>
        <div className={styles.headTop}>
          <span className={`${ui.skel} ${styles.tileSkel}`} />
          <div className={styles.headText}>
            <span className={ui.skel} style={{ width: '45%', height: 12 }} />
            <span className={ui.skel} style={{ width: '85%', height: 28, marginTop: 10 }} />
          </div>
        </div>
        <div className={styles.score}>
          <span className={ui.skel} style={{ width: 52, height: 52, borderRadius: '50%', flex: 'none' }} />
          <span className={ui.skel} style={{ width: 160, height: 34 }} />
        </div>
        <div className={styles.actions}>
          <span className={`${ui.skel} ${styles.dockSkel}`} />
        </div>
      </div>
      <span className={ui.skel} style={{ height: 180, borderRadius: 20, marginTop: 20 }} />
      <span className={ui.skel} style={{ height: 260, borderRadius: 20, marginTop: 20 }} />
    </div>
  )
}

export default function StudentLessonPage() {
  const router = useRouter()
  const id = router.isReady && typeof router.query.id === 'string' ? router.query.id : null
  const [state, setState] = useState({ status: 'loading', lesson: null, progress: null, error: '' })
  const [reloadKey, setReloadKey] = useState(0)
  const { me } = useMe() // shared with the shell (cached): the student's name for the printed header

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

  // Links like /student/lessons/<id>#recap-vocabulary (from the Words page): scroll once the recap is shown
  useEffect(() => {
    if (state.status !== 'ready') return
    const hash = window.location.hash.slice(1)
    const target = hash ? document.getElementById(hash) : null
    if (!target) return
    window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - HEADER_OFFSET })
  }, [state.status])

  if (state.status === 'notfound') {
    return (
      <StudentShell>
        <Head>
          <title>Lesson not found · Preply Lessons</title>
        </Head>
        <BackLink />
        <EmptyState
          emoji="🔎"
          tone="blue"
          headingLevel={1}
          title="Lesson not found"
          text="This lesson doesn’t exist or isn’t available anymore."
          action={
            <Link href="/student/lessons" className={`${ui.btn} ${ui.blue}`}>
              Back to my lessons
            </Link>
          }
        />
      </StudentShell>
    )
  }

  if (state.status === 'error') {
    return (
      <StudentShell>
        <Head>
          <title>Lesson · Preply Lessons</title>
        </Head>
        <BackLink />
        <h1 className="sr-only">Lesson</h1>
        <ErrorCard
          title="Couldn’t load this lesson"
          message={state.error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      </StudentShell>
    )
  }

  if (state.status !== 'ready') {
    return (
      <StudentShell>
        <Head>
          <title>Lesson · Preply Lessons</title>
        </Head>
        <BackLink />
        <h1 className="sr-only">Lesson</h1>
        <span className="sr-only" role="status">
          Loading the lesson…
        </span>
        <LessonSkeleton />
      </StudentShell>
    )
  }

  const { lesson, progress } = state
  const exerciseCount = Array.isArray(lesson.exercises) ? lesson.exercises.length : 0
  const driveUrl = safeHttpsUrl(lesson.drive_url)
  const date = formatLessonDate(lesson.lesson_date, DATE_OPTS)
  const bestScore = progress?.best_score == null ? null : Number(progress.best_score)
  const bestTotal = progress?.best_total == null ? null : Number(progress.best_total)
  const pct = bestScore === null ? null : percent(bestScore, bestTotal)
  const attempts = Number(progress?.attempts) || 0
  const lastPracticed = progress?.last_practiced_at ? timeAgo(progress.last_practiced_at) : ''
  const updated = Boolean(lesson.updated_since_practice) && pct === null
  // ?from=lesson: the practice page goes back here with history.back() (no duplicate entry)
  const practiceHref = `/student/lessons/${encodeURIComponent(lesson.id)}/practice?from=lesson`
  const cardsHref = `/student/vocabulary?lesson=${encodeURIComponent(lesson.id)}&mode=cards`
  const hasWords = hasItems(lesson.content?.vocabulary) || hasItems(lesson.content?.expressions)
  const title = lesson.title || lesson.content?.title || 'Lesson recap'

  return (
    <StudentShell>
      <Head>
        <title>{`${title} · Preply Lessons`}</title>
      </Head>

      <BackLink />

      <header className={styles.header} style={accentStyle(lesson.id)}>
        <div className={styles.headTop}>
          <span className={styles.tile} aria-hidden="true">
            {lessonEmoji(lesson.id)}
          </span>
          <div className={styles.headText}>
            {date && (
              <time className={styles.date} dateTime={lesson.lesson_date}>
                {date}
              </time>
            )}
            <h1 className={styles.title}>{title}</h1>
            {updated && (
              <span className={`${styles.updated} no-print`}>
                <span aria-hidden="true">🔄</span> Updated by your teacher
              </span>
            )}
          </div>
        </div>

        <div className={styles.score}>
          {pct !== null ? (
            <>
              <MasteryRing
                pct={pct}
                size={52}
                stroke={7}
                label={`Best score ${bestScore} out of ${bestTotal} (${pct}%)`}
                style={{ '--ring': 'var(--accent)' }}
              />
              <span className={styles.scoreText}>
                <strong>{pct === 100 ? 'Mastered! 👑' : `Best score ${bestScore}/${bestTotal}`}</strong>
                <span>
                  {plural(exerciseCount, 'exercise')}
                  {attempts > 0 && ` · practiced ${plural(attempts, 'time')}`}
                  {lastPracticed && ` · last ${lastPracticed}`}
                </span>
              </span>
            </>
          ) : exerciseCount > 0 ? (
            <span className={styles.scoreText}>
              <strong>
                <span aria-hidden="true">✨ </span>
                {updated ? 'New exercises to practice' : 'Not practiced yet'}
              </strong>
              <span>
                {plural(exerciseCount, 'exercise')} waiting for you
                {updated && lastPracticed && ` · you last practiced ${lastPracticed}`}
              </span>
            </span>
          ) : (
            <span className={styles.scoreText}>
              <strong>
                <span aria-hidden="true">📖 </span>Recap only
              </strong>
              <span>No exercises for this lesson</span>
            </span>
          )}
        </div>

        <div className={`${styles.actions} no-print`}>
          {exerciseCount > 0 && (
            <div className={styles.dock}>
              <Link href={practiceHref} className={`${ui.btn} ${ui.green} ${ui.block} ${styles.practice}`}>
                {pct === null ? 'Practice' : 'Practice again'}
                <span className={styles.practiceCount}>
                  {' '}
                  · {plural(exerciseCount, 'exercise')}
                </span>
              </Link>
            </div>
          )}
          <div className={styles.secondary}>
            <button type="button" className={`${ui.btn} ${ui.small} ${ui.ghost} ${styles.secondaryBtn}`} onClick={() => window.print()}>
              <span aria-hidden="true">🖨️</span> Save as PDF
            </button>
            {hasWords && (
              <Link href={cardsHref} className={`${ui.btn} ${ui.small} ${ui.ghost} ${styles.secondaryBtn}`}>
                <span aria-hidden="true">🃏</span> Word flashcards
              </Link>
            )}
            {driveUrl && (
              <a
                href={driveUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`${ui.btn} ${ui.small} ${ui.ghost} ${styles.secondaryBtn}`}
              >
                <span aria-hidden="true">📁</span> Open in Google Drive
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
          </div>
        </div>
      </header>

      <div className={styles.recap}>
        <LessonView
          content={lesson.content}
          title={title}
          lessonDate={lesson.lesson_date}
          studentName={me?.profile?.full_name || ''}
        />
      </div>

      {exerciseCount > 0 && <div className={`${styles.dockSpacer} no-print`} aria-hidden="true" />}
    </StudentShell>
  )
}
