import Link from 'next/link'
import StatusBadge from '@/components/teacher/StatusBadge'
import Skeleton from '@/components/teacher/Skeleton'
import { formatLessonDate, parseLocalDate, plural } from '@/components/teacher/format'
import styles from '@/components/teacher/LessonList.module.css'

function sortNewestFirst(lessons) {
  return [...lessons].sort((a, b) => {
    const da = a.lesson_date || ''
    const db = b.lesson_date || ''
    if (da !== db) return da < db ? 1 : -1
    return (b.created_at || '').localeCompare(a.created_at || '')
  })
}

function scoreText(lesson) {
  if (lesson.best_score == null || !lesson.best_total) return null
  return `${lesson.best_score}/${lesson.best_total}`
}

/** Lessons of one student, newest first, each linking to the teacher lesson page. */
export default function LessonList({ lessons }) {
  const sorted = sortNewestFirst(lessons || [])

  return (
    <ul className={styles.list}>
      {sorted.map((lesson) => {
        const date = parseLocalDate(lesson.lesson_date)
        const score = scoreText(lesson)
        const attempts = lesson.attempts || 0
        return (
          <li key={lesson.id}>
            <Link href={`/teacher/lessons/${lesson.id}`} className={styles.item}>
              <div className={styles.date} aria-hidden="true">
                {date ? (
                  <>
                    <span className={styles.day}>{date.getDate()}</span>
                    <span className={styles.month}>
                      {date.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}
                    </span>
                  </>
                ) : (
                  <span className={styles.month}>—</span>
                )}
              </div>

              <div className={styles.body}>
                <div className={styles.titleRow}>
                  <span className={styles.title}>{lesson.title?.trim() || 'Leçon sans titre'}</span>
                  <StatusBadge status={lesson.status} />
                </div>
                <div className={styles.meta}>
                  <span>{formatLessonDate(lesson.lesson_date)}</span>
                  {lesson.status === 'published' && (
                    <>
                      <span>{plural(lesson.exercise_count || 0, 'exercice')}</span>
                      <span>
                        {score ? (
                          <>
                            Meilleur score <strong className={styles.score}>{score}</strong>
                            {' · '}
                            {plural(attempts, 'tentative')}
                          </>
                        ) : (
                          'Pas encore pratiquée'
                        )}
                      </span>
                    </>
                  )}
                  {lesson.status === 'generating' && <span>Génération en cours…</span>}
                </div>
                {lesson.status === 'failed' && lesson.error && (
                  <div className={styles.error}>{lesson.error}</div>
                )}
              </div>

              <span className={styles.chevron} aria-hidden="true">›</span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export function LessonListSkeleton({ rows = 3 }) {
  return (
    <ul className={styles.list} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i}>
          <div className={styles.item}>
            <Skeleton width={48} height={48} radius={10} />
            <div className={styles.body}>
              <Skeleton width="60%" height={16} />
              <Skeleton width="80%" height={12} style={{ marginTop: 8 }} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
