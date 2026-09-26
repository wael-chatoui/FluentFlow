import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import StudentShell from '@/components/student/StudentShell'
import LessonCard, { LessonCardSkeleton } from '@/components/student/lessons/LessonCard'
import { EmptyState, ErrorCard } from '@/components/student/lessons/StatusViews'
import { FILTERS, filterById, sortNewestFirst } from '@/components/student/lessons/progress'
import { plural } from '@/components/lesson/format'
import { api } from '@/utils/apiClient'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/student/lessons/LessonsPage.module.css'

const EMPTY = {
  all: {
    emoji: '🌱',
    tone: 'green',
    title: 'No lessons yet',
    text: 'Your first lesson recap will appear here after your next class with Wael.',
  },
  todo: {
    emoji: '🎉',
    tone: 'green',
    title: 'All caught up!',
    text: 'You’ve practised every lesson that has exercises.',
  },
  work: {
    emoji: '💪',
    tone: 'blue',
    title: 'Nothing needs work',
    text: 'All your practised lessons are at 80% or more. Nice!',
  },
  mastered: {
    emoji: '🏆',
    tone: 'purple',
    title: 'No mastered lessons yet',
    text: 'Score 100% on a lesson’s exercises to master it.',
  },
}

export default function StudentLessonsPage() {
  const router = useRouter()
  const [state, setState] = useState({ status: 'loading', lessons: [], error: '' })
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    setState((s) => ({ ...s, status: 'loading', error: '' }))

    api('/api/student/lessons', { signal })
      .then((data) => {
        if (signal.aborted) return
        setState({ status: 'ready', lessons: sortNewestFirst(data?.lessons), error: '' })
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || signal.aborted) return
        setState({ status: 'error', lessons: [], error: err?.message || 'Something went wrong.' })
      })

    return () => controller.abort()
  }, [reloadKey])

  // The filter lives in the URL (?filter=…) so Back from a lesson keeps it
  const filterId = router.isReady && typeof router.query.filter === 'string' ? filterById(router.query.filter).id : 'all'
  const filter = filterById(filterId)

  const counts = useMemo(() => {
    const out = {}
    for (const f of FILTERS) out[f.id] = state.lessons.filter(f.test).length
    return out
  }, [state.lessons])

  const visible = useMemo(() => state.lessons.filter(filter.test), [state.lessons, filter])

  const setFilter = (id) => {
    if (id === filterId) return
    router.replace(
      { pathname: '/student/lessons', query: id === 'all' ? {} : { filter: id } },
      undefined,
      { shallow: true, scroll: false }
    )
  }

  const loading = state.status === 'loading'
  const ready = state.status === 'ready'
  const empty = EMPTY[filterId] || EMPTY.all

  return (
    <StudentShell>
      <Head>
        <title>My lessons · Preply Lessons</title>
      </Head>

      <header className={styles.header}>
        <h1 className={styles.title}>
          Your lessons <span aria-hidden="true">📚</span>
        </h1>
        <p className={styles.subtitle}>
          {ready && state.lessons.length > 0
            ? `${plural(state.lessons.length, 'lesson')} from your classes with Wael`
            : 'Recaps and exercises from your classes with Wael'}
        </p>
      </header>

      {state.status === 'error' ? (
        <ErrorCard
          title="Couldn’t load your lessons"
          message={state.error}
          onRetry={() => setReloadKey((k) => k + 1)}
        />
      ) : (
        <>
          {(loading || state.lessons.length > 0) && (
            <div className={styles.chips} role="group" aria-label="Filter lessons">
              {FILTERS.map((f) => {
                const active = f.id === filterId
                return (
                  <button
                    key={f.id}
                    type="button"
                    className={`${styles.chip} ${styles[`chip_${f.id}`]} ${active ? styles.chipActive : ''}`}
                    aria-pressed={active}
                    disabled={!ready}
                    onClick={() => setFilter(f.id)}
                  >
                    {f.label}
                    <span className={styles.chipCount}>
                      {ready ? counts[f.id] : '·'}
                      <span className="sr-only"> lessons</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <p className="sr-only" aria-live="polite">
            {ready && state.lessons.length > 0
              ? `${filter.label}: ${plural(visible.length, 'lesson')}`
              : ''}
          </p>

          {loading ? (
            <ul className={styles.list} aria-label="Loading lessons" aria-busy="true">
              <LessonCardSkeleton />
              <LessonCardSkeleton />
              <LessonCardSkeleton />
              <LessonCardSkeleton />
            </ul>
          ) : visible.length === 0 ? (
            <EmptyState
              key={filterId}
              emoji={empty.emoji}
              tone={empty.tone}
              title={empty.title}
              text={empty.text}
              action={
                filterId !== 'all' ? (
                  <button type="button" className={`${ui.btn} ${ui.ghost}`} onClick={() => setFilter('all')}>
                    Show all lessons
                  </button>
                ) : null
              }
            />
          ) : (
            <ul className={styles.list} key={filterId}>
              {visible.map((lesson, i) => (
                <LessonCard key={lesson.id} lesson={lesson} index={i} />
              ))}
            </ul>
          )}
        </>
      )}
    </StudentShell>
  )
}
