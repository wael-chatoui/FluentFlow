import { useMemo, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import StudentShell from '@/components/student/StudentShell'
import useLessons from '@/components/student/useLessons'
import LessonCard, { LessonCardSkeleton } from '@/components/student/lessons/LessonCard'
import { EmptyState, ErrorCard } from '@/components/student/lessons/StatusViews'
import { FILTERS, filterById, sortNewestFirst } from '@/components/student/lessons/progress'
import { plural } from '@/components/lesson/format'
import { foldFrench } from '@/utils/api/studentLessons'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/student/lessons/LessonsPage.module.css'

// The search box only helps once the list gets long
const SEARCH_MIN_LESSONS = 5

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
    text: 'You’ve practiced every lesson that has exercises.',
  },
  work: {
    emoji: '💪',
    tone: 'blue',
    title: 'Nothing needs work',
    text: 'All your practiced lessons are at 80% or more. Nice!',
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
  const { data, error, loading, reload } = useLessons()
  const [query, setQuery] = useState('')

  const lessons = useMemo(() => sortNewestFirst(data?.lessons), [data])
  const showSearch = lessons.length >= SEARCH_MIN_LESSONS
  // A query only filters while its box is shown (the list can shrink under the threshold)
  const needle = showSearch ? foldFrench(query) : ''
  const searched = useMemo(
    () => (needle ? lessons.filter((l) => foldFrench(l.title).includes(needle)) : lessons),
    [lessons, needle]
  )

  // The filter lives in the URL (?filter=…) so Back from a lesson keeps it
  const filterId = router.isReady && typeof router.query.filter === 'string' ? filterById(router.query.filter).id : 'all'
  const filter = filterById(filterId)

  const counts = useMemo(() => {
    const out = {}
    for (const f of FILTERS) out[f.id] = searched.filter(f.test).length
    return out
  }, [searched])

  const visible = useMemo(() => searched.filter(filter.test), [searched, filter])

  const setFilter = (id) => {
    if (id === filterId) return
    router.replace(
      { pathname: '/student/lessons', query: id === 'all' ? {} : { filter: id } },
      undefined,
      { shallow: true, scroll: false }
    )
  }

  const failed = !data && Boolean(error)
  const ready = Boolean(data)
  // No lessons at all: say so whatever the filter in the URL (its chips are hidden then)
  const noLessons = lessons.length === 0
  const empty = noLessons ? EMPTY.all : EMPTY[filterId] || EMPTY.all

  let emptyView = null
  if (ready && visible.length === 0) {
    emptyView = needle ? (
      <EmptyState
        emoji="🔍"
        tone="blue"
        title="No matches"
        text={`No lesson title matches “${query.trim()}”${filterId !== 'all' ? ` in ${filter.label}` : ''}.`}
        action={
          <button type="button" className={`${ui.btn} ${ui.ghost}`} onClick={() => setQuery('')}>
            Clear search
          </button>
        }
      />
    ) : (
      <EmptyState
        key={filterId}
        emoji={empty.emoji}
        tone={empty.tone}
        title={empty.title}
        text={empty.text}
        action={
          filterId !== 'all' && !noLessons ? (
            <button type="button" className={`${ui.btn} ${ui.ghost}`} onClick={() => setFilter('all')}>
              Show all lessons
            </button>
          ) : null
        }
      />
    )
  }

  return (
    <StudentShell>
      <Head>
        <title>My lessons · Preply Lessons</title>
      </Head>

      <header className={styles.header}>
        <h1 className={styles.title}>
          My lessons <span aria-hidden="true">📚</span>
        </h1>
        <p className={styles.subtitle}>
          {ready && lessons.length > 0
            ? `${plural(lessons.length, 'lesson')} from your classes with Wael`
            : 'Recaps and exercises from your classes with Wael'}
        </p>
      </header>

      {failed ? (
        <ErrorCard title="Couldn’t load your lessons" message={error.message} onRetry={reload} />
      ) : (
        <>
          {showSearch && (
            <div className={styles.search} role="search">
              <span className={styles.searchIcon} aria-hidden="true">
                🔍
              </span>
              <label htmlFor="lesson-search" className="sr-only">
                Search your lessons
              </label>
              <input
                id="lesson-search"
                type="search"
                className={styles.searchInput}
                placeholder="Search by title"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                enterKeyHint="search"
              />
              {query && (
                <button type="button" className={styles.searchClear} onClick={() => setQuery('')} aria-label="Clear search">
                  ✕
                </button>
              )}
            </div>
          )}

          {(loading || lessons.length > 0) && (
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
                      <span className="sr-only">{ready && counts[f.id] === 1 ? ' lesson' : ' lessons'}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          <p className="sr-only" aria-live="polite">
            {ready && lessons.length > 0 ? `${filter.label}: ${plural(visible.length, 'lesson')}` : ''}
          </p>

          {loading ? (
            <ul className={styles.list} aria-label="Loading lessons" aria-busy="true">
              <LessonCardSkeleton />
              <LessonCardSkeleton />
              <LessonCardSkeleton />
              <LessonCardSkeleton />
            </ul>
          ) : (
            emptyView || (
              <ul className={styles.list} key={filterId}>
                {visible.map((lesson, i) => (
                  <LessonCard key={lesson.id} lesson={lesson} index={i} headingLevel={2} />
                ))}
              </ul>
            )
          )}
        </>
      )}
    </StudentShell>
  )
}
