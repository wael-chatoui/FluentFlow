import Link from 'next/link'
import ScoreRing from '@/components/lesson/ScoreRing'
import { formatLessonDate, plural } from '@/components/lesson/format'
import styles from '@/components/lesson/StudentPages.module.css'

/**
 * One lesson in the student's list. The whole card links to the lesson
 * (stretched link); the "Practice" button sits above it.
 * @param {{ lesson: { id, title, lesson_date, exercise_count, best_score, best_total, attempts } }} props
 */
export default function LessonCard({ lesson }) {
  const href = `/student/lessons/${encodeURIComponent(lesson.id)}`
  const count = Number(lesson.exercise_count) || 0
  const practised = Number.isFinite(lesson.best_score) && Number(lesson.best_total) > 0

  return (
    <li className={styles.card}>
      <div className={styles.cardMain}>
        {lesson.lesson_date && (
          <time className={styles.cardDate} dateTime={lesson.lesson_date}>
            {formatLessonDate(lesson.lesson_date)}
          </time>
        )}
        <h3 className={styles.cardTitle}>
          <Link href={href} className={styles.cardLink}>
            {lesson.title || 'Lesson recap'}
          </Link>
        </h3>
        <p className={styles.cardMeta}>
          {count > 0 ? plural(count, 'exercise') : 'Recap only'}
          {practised && Number(lesson.attempts) > 0 && (
            <> · practised {plural(Number(lesson.attempts), 'time')}</>
          )}
        </p>
      </div>

      <div className={styles.cardSide}>
        {practised ? (
          <ScoreRing score={lesson.best_score} total={lesson.best_total} />
        ) : (
          count > 0 && <span className={styles.notPractised}>Not practised yet</span>
        )}
        {count > 0 && (
          <Link
            href={`${href}/practice`}
            className={`btn btn-primary btn-sm ${styles.practiceBtn}`}
            aria-label={`Practice: ${lesson.title || 'lesson'}`}
          >
            Practice
          </Link>
        )}
      </div>
    </li>
  )
}

export function LessonCardSkeleton() {
  return (
    <li className={`${styles.card} ${styles.cardSkeleton}`} aria-hidden="true">
      <div className={styles.cardMain}>
        <span className={styles.skel} style={{ width: '38%', height: 12 }} />
        <span className={styles.skel} style={{ width: '72%', height: 18, marginTop: 8 }} />
        <span className={styles.skel} style={{ width: '30%', height: 12, marginTop: 8 }} />
      </div>
      <div className={styles.cardSide}>
        <span className={styles.skel} style={{ width: 48, height: 48, borderRadius: '50%' }} />
        <span className={styles.skel} style={{ width: 84, height: 36, borderRadius: 10 }} />
      </div>
    </li>
  )
}
