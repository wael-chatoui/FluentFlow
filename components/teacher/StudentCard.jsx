import Link from 'next/link'
import Skeleton from '@/components/teacher/Skeleton'
import { accentStyle } from '@/components/ui/accents'
import {
  ACCOUNT_STATE_LABELS,
  accountState,
  formatLessonDate,
  initialsOf,
  levelBadgeText,
  studentDisplayName,
} from '@/components/teacher/format'
import styles from '@/components/teacher/StudentCard.module.css'

/**
 * Student card of the teacher dashboard grid (accent color per student). The name links
 * to the student page (the whole card is clickable); « Nouvelle leçon » goes straight to
 * the form with the student preselected.
 */
export default function StudentCard({ student, index = 0 }) {
  const name = studentDisplayName(student)
  const hasName = Boolean(student.full_name?.trim())
  const level = levelBadgeText(student.level)
  const count = student.lesson_count || 0
  const state = accountState(student)

  return (
    <article className={styles.card} style={{ ...accentStyle(student.id), '--i': Math.min(index, 6) }}>
      <div className={styles.head}>
        <span className={styles.avatar} aria-hidden="true">{initialsOf(name)}</span>
        <div className={styles.identity}>
          <h3 className={styles.name}>
            <Link href={`/teacher/students/${student.id}`} className={styles.link}>
              {name}
            </Link>
          </h3>
          {hasName && <div className={styles.email}>{student.email}</div>}
        </div>
        <span className={styles.chevron} aria-hidden="true">›</span>
      </div>

      <div className={styles.pills}>
        {level ? (
          <span className={`${styles.pill} ${styles.pillLevel}`}>
            <span aria-hidden="true">🇫🇷</span>
            <span className="sr-only">Niveau </span>
            {level}
          </span>
        ) : (
          <span className={styles.pill}>Niveau ?</span>
        )}
        {state !== 'active' && (
          <span className={`${styles.pill} ${styles.pillPending}`}>
            <span aria-hidden="true">{ACCOUNT_STATE_LABELS[state].icon}</span> {ACCOUNT_STATE_LABELS[state].label}
          </span>
        )}
      </div>

      <dl className={styles.meta}>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>
            <span aria-hidden="true">📚 </span>Leçons
          </dt>
          <dd className={styles.statValue}>{count}</dd>
        </div>
        <div className={styles.stat}>
          <dt className={styles.statLabel}>
            <span aria-hidden="true">📅 </span>Dernière leçon
          </dt>
          <dd className={`${styles.statValue} ${student.last_lesson_date ? '' : styles.statEmpty}`}>
            {student.last_lesson_date ? formatLessonDate(student.last_lesson_date) : 'Aucune'}
          </dd>
        </div>
      </dl>

      <Link href={`/teacher/lessons/new?student=${student.id}`} className={styles.quick}>
        <span aria-hidden="true">✨</span> Nouvelle leçon<span className="sr-only"> pour {name}</span>
      </Link>
    </article>
  )
}

export function StudentCardSkeleton() {
  return (
    <div className={`${styles.card} ${styles.skeletonCard}`} aria-hidden="true">
      <div className={styles.head}>
        <Skeleton width={56} height={56} radius={16} />
        <div className={styles.identity}>
          <Skeleton width="70%" height={18} />
          <Skeleton width="55%" height={12} style={{ marginTop: 8 }} />
        </div>
      </div>
      <div className={styles.pills}>
        <Skeleton width={64} height={28} radius={999} />
      </div>
      <div className={styles.meta}>
        <Skeleton height={58} radius={14} />
        <Skeleton height={58} radius={14} />
      </div>
      <Skeleton height={44} radius={14} />
    </div>
  )
}
