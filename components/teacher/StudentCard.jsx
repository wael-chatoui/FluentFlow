import Link from 'next/link'
import Skeleton from '@/components/teacher/Skeleton'
import { formatLessonDate, initialsOf, levelBadgeText, studentDisplayName } from '@/components/teacher/format'
import styles from '@/components/teacher/StudentCard.module.css'

/** Clickable student card for the teacher dashboard grid. */
export default function StudentCard({ student }) {
  const name = studentDisplayName(student)
  const hasName = Boolean(student.full_name?.trim())
  const level = levelBadgeText(student.level)
  const count = student.lesson_count || 0

  return (
    <Link href={`/teacher/students/${student.id}`} className={styles.card}>
      <div className={styles.head}>
        <div className={styles.avatar} aria-hidden="true">{initialsOf(name)}</div>
        <div className={styles.identity}>
          <div className={styles.name}>{name}</div>
          {hasName && <div className={styles.email}>{student.email}</div>}
        </div>
      </div>

      <div className={styles.badges}>
        {level ? <span className="badge badge-pink">{level}</span> : <span className="badge badge-gray">Niveau ?</span>}
        {!student.onboarded_at && <span className="badge badge-gray">Pas encore inscrit</span>}
      </div>

      <dl className={styles.meta}>
        <div>
          <dt>Leçons</dt>
          <dd>{count}</dd>
        </div>
        <div>
          <dt>Dernière leçon</dt>
          <dd>{student.last_lesson_date ? formatLessonDate(student.last_lesson_date) : '—'}</dd>
        </div>
      </dl>
    </Link>
  )
}

export function StudentCardSkeleton() {
  return (
    <div className={`${styles.card} ${styles.skeletonCard}`} aria-hidden="true">
      <div className={styles.head}>
        <Skeleton width={44} height={44} radius="50%" />
        <div className={styles.identity}>
          <Skeleton width="70%" height={16} />
          <Skeleton width="50%" height={12} style={{ marginTop: 8 }} />
        </div>
      </div>
      <div className={styles.badges}>
        <Skeleton width={48} height={22} radius={999} />
      </div>
      <div className={styles.meta}>
        <Skeleton width="80%" height={30} />
        <Skeleton width="80%" height={30} />
      </div>
    </div>
  )
}
