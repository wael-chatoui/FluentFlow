import { useMemo } from 'react'
import Link from 'next/link'
import { accentStyle } from '@/components/ui/accents'
import { formatLessonDate, plural } from '@/components/lesson/format'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/student/review/ReviewIntro.module.css'

// GET /api/student/review returns at most this many mistakes per round
const ROUND_MAX = 20

/** Groups exercises by lesson, keeping the API order (newest lessons first). */
function groupByLesson(exercises) {
  const groups = []
  const byId = new Map()
  for (const ex of exercises) {
    const id = String(ex.lessonId || '')
    let group = byId.get(id)
    if (!group) {
      group = { lessonId: id, title: ex.lessonTitle || 'Lesson', date: ex.lesson_date || '', count: 0 }
      byId.set(id, group)
      groups.push(group)
    }
    group.count += 1
  }
  return groups
}

function ResultBanner({ result }) {
  if (!result) return null
  const remaining = Number(result.remaining)
  const score = Number(result.score) || 0
  const total = Number(result.total) || 0
  const allFixed = Number.isFinite(remaining) && remaining === 0
  return (
    <div className={`${styles.banner} ${allFixed ? styles.bannerGood : ''}`}>
      <span className={styles.bannerIcon} aria-hidden="true">
        {allFixed ? '🏆' : score > 0 ? '💪' : '🌱'}
      </span>
      <div className={styles.bannerText}>
        <p className={styles.bannerTitle}>
          {total > 0 ? `You fixed ${score} of ${total}` : 'Review saved'}
        </p>
        {Number.isFinite(remaining) && (
          <p className={styles.bannerSub}>
            {allFixed ? 'No mistakes left — well done!' : `${plural(remaining, 'mistake')} remaining`}
          </p>
        )}
      </div>
    </div>
  )
}

function IntroSkeleton() {
  return (
    <div aria-hidden="true">
      <div className={`${ui.card} ${styles.hero}`}>
        <span className={`${ui.skel} ${styles.skelBadge}`} />
        <span className={`${ui.skel} ${styles.skelTitle}`} />
        <span className={`${ui.skel} ${styles.skelLine}`} />
        <span className={`${ui.skel} ${styles.skelButton}`} />
      </div>
      <span className={`${ui.skel} ${styles.skelHeading}`} />
      <ul className={styles.groups}>
        {[0, 1, 2].map((i) => (
          <li key={i} className={`${styles.group} ${styles.groupSkel}`}>
            <span className={`${ui.skel} ${styles.skelDot}`} />
            <span className={styles.groupMain}>
              <span className={`${ui.skel} ${styles.skelRowTitle}`} />
              <span className={`${ui.skel} ${styles.skelRowDate}`} />
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * Intro screen of /student/review (inside StudentShell).
 * @param {{ status: 'loading'|'ready'|'error', exercises: object[], error: string,
 *   lastResult: { score, total, remaining } | null, onStart: () => void, onRetry: () => void }} props
 */
export default function ReviewIntro({ status, exercises, error, lastResult, onStart, onRetry }) {
  const groups = useMemo(() => groupByLesson(exercises), [exercises])
  const count = exercises.length

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Review</h1>

      <div aria-live="polite">
        <ResultBanner result={lastResult} />
      </div>

      {status === 'loading' && (
        <div role="status" aria-busy="true">
          <span className="sr-only">Loading your mistakes…</span>
          <IntroSkeleton />
        </div>
      )}

      {status === 'error' && (
        <div className={`${ui.card} ${styles.center}`} role="alert">
          <div className={styles.bigEmoji} aria-hidden="true">😵‍💫</div>
          <h2 className={styles.heroTitle}>Couldn&apos;t load your mistakes</h2>
          <p className={styles.heroText}>{error}</p>
          <button type="button" className={`${ui.btn} ${ui.blue}`} onClick={onRetry}>
            Try again
          </button>
        </div>
      )}

      {status === 'ready' && count === 0 && (
        <div className={`${ui.card} ${styles.center} ${styles.pop}`}>
          <div className={`${styles.bigEmoji} ${styles.bounce}`} aria-hidden="true">🏆</div>
          <h2 className={styles.heroTitle}>No mistakes to review 🎉</h2>
          <p className={styles.heroText}>
            Every exercise you&apos;ve practised is correct. Keep going with a lesson or your word bank!
          </p>
          <div className={styles.emptyActions}>
            <Link href="/student/lessons" className={`${ui.btn} ${ui.blue}`}>
              <span aria-hidden="true">📚</span> Lessons
            </Link>
            <Link href="/student/vocabulary" className={`${ui.btn} ${ui.green}`}>
              <span aria-hidden="true">🔤</span> Words
            </Link>
          </div>
        </div>
      )}

      {status === 'ready' && count > 0 && (
        <>
          <section className={`${ui.card} ${styles.hero} ${styles.pop}`} aria-labelledby="review-count">
            <div className={styles.target} aria-hidden="true">
              <span className={styles.bounce}>🎯</span>
            </div>
            <h2 id="review-count" className={styles.heroTitle}>
              {count} {count === 1 ? 'mistake' : 'mistakes'} to fix
            </h2>
            <p className={styles.heroText}>
              Exercises you got wrong in your lessons. Get them right to clear them from this list.
            </p>
            {count >= ROUND_MAX && (
              <p className={styles.heroHint}>Up to {ROUND_MAX} per round — do another one afterwards!</p>
            )}
            <button type="button" className={`${ui.btn} ${ui.orange} ${ui.block} ${styles.startBtn}`} onClick={onStart}>
              Start review
            </button>
          </section>

          <h2 className={ui.sectionTitle}>From your lessons</h2>
          <ul className={styles.groups}>
            {groups.map((g) => {
              const date = formatLessonDate(g.date, { month: 'short', day: 'numeric', year: 'numeric' })
              const content = (
                <>
                  <span className={styles.dot} aria-hidden="true" />
                  <span className={styles.groupMain}>
                    <span className={styles.groupTitle}>{g.title}</span>
                    {date && (
                      <time className={styles.groupDate} dateTime={g.date}>
                        {date}
                      </time>
                    )}
                  </span>
                  <span className={styles.count}>{plural(g.count, 'mistake')}</span>
                </>
              )
              return (
                <li key={g.lessonId || 'none'} style={accentStyle(g.lessonId)}>
                  {g.lessonId ? (
                    <Link href={`/student/lessons/${encodeURIComponent(g.lessonId)}`} className={styles.group}>
                      {content}
                    </Link>
                  ) : (
                    <div className={styles.group}>{content}</div>
                  )}
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}
