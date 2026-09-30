import { useMemo } from 'react'
import Link from 'next/link'
import { accentStyle } from '@/components/ui/accents'
import { formatLessonDate, plural } from '@/components/lesson/format'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/student/review/ReviewIntro.module.css'
import { BookOpen, CircleAlert, Dumbbell, Library, RotateCcw, Sprout, TriangleAlert, Trophy } from 'lucide-react'
import Icon from '@/components/ui/Icon'

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
  const skipped = Number(result.skipped) || 0
  const allFixed = Number.isFinite(remaining) && remaining === 0
  return (
    <div className={`${styles.banner} ${allFixed ? styles.bannerGood : ''}`}>
      <span className={styles.bannerIcon} aria-hidden="true">
        <Icon icon={allFixed ? Trophy : score > 0 ? Dumbbell : Sprout} size={28} />
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
        {skipped > 0 && (
          <p className={styles.bannerSub}>
            {plural(skipped, 'answer')} skipped: your teacher updated or removed the lesson
          </p>
        )}
      </div>
    </div>
  )
}

// The last round couldn't be saved and the player is closed: its answers wait here
function UnsavedBanner({ unsaved, onRetry, onDiscard }) {
  if (!unsaved) return null
  return (
    <div className={`${styles.banner} ${styles.bannerError}`} role="alert">
      <span className={styles.bannerIcon} aria-hidden="true">
        <Icon icon={TriangleAlert} size={28} />
      </span>
      <div className={styles.bannerText}>
        <p className={styles.bannerTitle}>Your last round wasn’t saved</p>
        <p className={styles.bannerSub}>{unsaved.error}</p>
        <div className={styles.bannerActions}>
          <button
            type="button"
            className={`${ui.btn} ${ui.small} ${ui.blue}`}
            onClick={onRetry}
            disabled={unsaved.retrying}
          >
            {unsaved.retrying ? 'Saving…' : 'Try again'}
          </button>
          <button
            type="button"
            className={`${ui.btn} ${ui.small} ${ui.ghost}`}
            onClick={onDiscard}
            disabled={unsaved.retrying}
          >
            Discard
          </button>
        </div>
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
 * @param {{ status: 'loading'|'ready'|'error', exercises: object[], total: number, error: string,
 *   lastResult: { score?, total?, remaining, skipped } | null,
 *   unsaved: { error: string, retrying: boolean } | null, onStart: () => void, onRetry: () => void,
 *   onRetrySave: () => void, onDiscardSave: () => void }} props
 *   exercises = this round (at most 20); total = every mistake to fix (same number as Home);
 *   unsaved = the last round's save failed after the player was closed (starting a round drops it)
 */
export default function ReviewIntro({
  status,
  exercises,
  total,
  error,
  lastResult,
  unsaved,
  onStart,
  onRetry,
  onRetrySave,
  onDiscardSave,
}) {
  const groups = useMemo(() => groupByLesson(exercises), [exercises])
  const count = exercises.length
  const all = Math.max(count, Number(total) || 0)

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Review</h1>

      <UnsavedBanner unsaved={unsaved} onRetry={onRetrySave} onDiscard={onDiscardSave} />

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
          <div className={`${styles.bigEmoji} ${styles.bigEmojiError}`} aria-hidden="true">
            <Icon icon={CircleAlert} size={44} />
          </div>
          <h2 className={styles.heroTitle}>Couldn’t load your mistakes</h2>
          <p className={styles.heroText}>{error}</p>
          <button type="button" className={`${ui.btn} ${ui.blue}`} onClick={onRetry}>
            Try again
          </button>
        </div>
      )}

      {status === 'ready' && count === 0 && (
        <div className={`${ui.card} ${styles.center} ${styles.pop}`}>
          <div className={styles.bigEmoji} aria-hidden="true">
            <Icon icon={Trophy} size={44} className={styles.bounce} />
          </div>
          <h2 className={styles.heroTitle}>No mistakes to review</h2>
          <p className={styles.heroText}>
            Every exercise you’ve practiced is correct. Keep going with a lesson or your word bank!
          </p>
          <div className={styles.emptyActions}>
            <Link href="/student/lessons" className={`${ui.btn} ${ui.blue}`}>
              <Icon icon={BookOpen} size={20} /> My lessons
            </Link>
            <Link href="/student/vocabulary" className={`${ui.btn} ${ui.green}`}>
              <Icon icon={Library} size={20} /> Words
            </Link>
          </div>
        </div>
      )}

      {status === 'ready' && count > 0 && (
        <>
          <section className={`${ui.card} ${styles.hero} ${styles.pop}`} aria-labelledby="review-count">
            <div className={styles.target} aria-hidden="true">
              <Icon icon={RotateCcw} size={48} className={styles.bounce} />
            </div>
            <h2 id="review-count" className={styles.heroTitle}>
              {plural(all, 'mistake')} to fix
            </h2>
            <p className={styles.heroText}>
              Exercises you got wrong in your lessons. Get them right to clear them from this list.
            </p>
            {all > count && (
              <p className={styles.heroHint}>{count} in this round — do another one afterwards!</p>
            )}
            <button
              type="button"
              className={`${ui.btn} ${ui.orange} ${ui.block} ${styles.startBtn}`}
              onClick={onStart}
              disabled={Boolean(unsaved?.retrying)}
            >
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
