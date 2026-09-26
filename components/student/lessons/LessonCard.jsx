import Link from 'next/link'
import { formatLessonDate, plural } from '@/components/lesson/format'
import { accentStyle } from '@/components/ui/accents'
import { bestPct, exerciseCount, lessonEmoji, vocabCount } from '@/components/student/lessons/progress'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/student/lessons/LessonCard.module.css'

const DATE_OPTS = { month: 'short', day: 'numeric', year: 'numeric' }

/**
 * One lesson in a student list. The whole card opens the lesson (stretched link);
 * the Practise button sits above it.
 * @param {{ lesson: object, index?: number }} props  lesson = item of GET /api/student/lessons
 */
export default function LessonCard({ lesson, index = 0 }) {
  const href = `/student/lessons/${encodeURIComponent(lesson.id)}`
  const title = lesson.title || 'Lesson recap'
  const count = exerciseCount(lesson)
  const words = vocabCount(lesson)
  const pct = bestPct(lesson)
  const date = formatLessonDate(lesson.lesson_date, DATE_OPTS)

  const btnColor = pct === null ? ui.green : pct === 100 ? ui.ghost : ui.blue

  return (
    <li className={styles.card} style={{ ...accentStyle(lesson.id), '--i': Math.min(index, 4) }}>
      <span className={styles.tile} aria-hidden="true">{lessonEmoji(lesson.id)}</span>

      <div className={styles.body}>
        {date && (
          <time className={styles.date} dateTime={lesson.lesson_date}>
            {date}
          </time>
        )}
        <h3 className={styles.title}>
          <Link href={href} className={styles.link}>
            {title}
          </Link>
        </h3>
        <p className={styles.meta}>
          {count > 0 ? plural(count, 'exercise') : 'Recap only'}
          {words > 0 && <> · {plural(words, 'word')}</>}
        </p>
      </div>

      <div className={styles.footer}>
        {pct !== null ? (
          <div className={styles.progress}>
            <span className={styles.track} aria-hidden="true">
              <span className={styles.fill} style={{ width: `${Math.max(pct, 4)}%` }} />
            </span>
            <span className={styles.pct}>
              {pct === 100 ? (
                <>
                  <span aria-hidden="true">👑 </span>Mastered
                </>
              ) : (
                `Best ${pct}%`
              )}
            </span>
          </div>
        ) : count > 0 ? (
          <span className={`${styles.badge} ${styles.badgeNew}`}>
            <span aria-hidden="true">✨</span> New
          </span>
        ) : (
          <span className={styles.badge}>
            <span aria-hidden="true">📖</span> Read the recap
          </span>
        )}

        {count > 0 && (
          <Link
            href={`${href}/practice`}
            className={`${ui.btn} ${ui.small} ${btnColor} ${styles.practise}`}
            aria-label={`Practise: ${title}`}
          >
            Practise
          </Link>
        )}
      </div>
    </li>
  )
}

export function LessonCardSkeleton() {
  return (
    <li className={`${styles.card} ${styles.skeleton}`} aria-hidden="true">
      <span className={`${ui.skel} ${styles.tileSkel}`} />
      <div className={styles.body}>
        <span className={ui.skel} style={{ width: '40%', height: 12, marginTop: 2 }} />
        <span className={ui.skel} style={{ width: '78%', height: 18, marginTop: 8 }} />
        <span className={ui.skel} style={{ width: '32%', height: 12, marginTop: 8 }} />
      </div>
      <div className={styles.footer}>
        <span className={ui.skel} style={{ flex: 1, height: 12, borderRadius: 999 }} />
        <span className={ui.skel} style={{ width: 104, height: 44, borderRadius: 12 }} />
      </div>
    </li>
  )
}
