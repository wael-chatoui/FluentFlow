import Link from 'next/link'
import { accentStyle } from '@/components/ui/accents'
import { formatRelative, initialsOf, lessonTitle, plural, studentDisplayName } from '@/components/teacher/format'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/dashboard/Overview.module.css'

function ListSkeleton() {
  return (
    <div className={styles.skeleton} aria-hidden="true">
      <span className={ui.skel} style={{ height: 52, borderRadius: 14 }} />
      <span className={ui.skel} style={{ height: 52, borderRadius: 14 }} />
    </div>
  )
}

function scoreTone(score, total) {
  const pct = total ? score / total : 0
  return pct >= 0.8 ? styles.scoreGood : pct >= 0.5 ? styles.scoreOk : styles.scoreLow
}

/**
 * « Élèves sans leçon récente » (GET /api/teacher/overview `inactive`: last lesson more than
 * 14 days ago, or none since joining more than 7 days ago; each row says which), with
 * shortcuts to a new lesson and to the next-lesson plan.
 * @param {{ items: object[] | null, loading: boolean }} props  items null when the overview failed
 */
export function InactiveStudents({ items, loading }) {
  return (
    <section className={styles.panel} aria-labelledby="inactive-title">
      <h2 id="inactive-title" className={styles.panelTitle}>
        <span aria-hidden="true">💤</span> Élèves sans leçon récente
      </h2>
      {loading ? (
        <ListSkeleton />
      ) : !items ? (
        <p className={styles.empty}>Liste indisponible pour le moment.</p>
      ) : items.length === 0 ? (
        <p className={styles.empty}>
          <span aria-hidden="true">👏 </span>Tous tes élèves ont eu une leçon récemment.
        </p>
      ) : (
        <ul className={styles.items}>
          {items.map((s) => (
            <li key={s.id} className={styles.item} style={accentStyle(s.id)}>
              <span className={styles.avatar} aria-hidden="true">{initialsOf(studentDisplayName(s))}</span>
              <div className={styles.itemText}>
                <Link href={`/teacher/students/${s.id}`} className={styles.itemLink}>
                  {studentDisplayName(s)}
                </Link>
                <span className={styles.itemMeta}>
                  {s.last_lesson_date
                    ? `Dernière leçon il y a ${plural(s.days, 'jour')}`
                    : `Aucune leçon · inscrit il y a ${plural(s.days, 'jour')}`}
                </span>
              </div>
              <div className={styles.itemActions}>
                <Link href={`/teacher/lessons/new?student=${s.id}`} className={`${ui.btn} ${ui.small} ${bits.blueGhost} ${bits.tap}`}>
                  <span aria-hidden="true">✨</span> Leçon<span className="sr-only"> pour {studentDisplayName(s)}</span>
                </Link>
                <Link href={`/teacher/students/${s.id}#plan`} className={`${ui.btn} ${ui.small} ${bits.tap}`}>
                  <span aria-hidden="true">🗺️</span> Préparer<span className="sr-only"> le prochain cours de {studentDisplayName(s)}</span>
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/**
 * « Activité récente »: practice sessions of the last 7 days (newest first), linking to
 * the lesson's results.
 * @param {{ items: object[] | null, loading: boolean }} props
 */
export function RecentActivity({ items, loading }) {
  return (
    <section className={styles.panel} aria-labelledby="activity-title">
      <h2 id="activity-title" className={styles.panelTitle}>
        <span aria-hidden="true">🏃</span> Activité récente
      </h2>
      {loading ? (
        <ListSkeleton />
      ) : !items ? (
        <p className={styles.empty}>Activité indisponible pour le moment.</p>
      ) : items.length === 0 ? (
        <p className={styles.empty}>Aucun exercice fait ces 7 derniers jours.</p>
      ) : (
        <ul className={styles.items}>
          {items.map((a, i) => (
            <li key={`${a.lesson_id}-${a.completed_at}-${i}`} className={styles.item}>
              <span className={`${styles.score} ${scoreTone(a.score, a.total)}`}>
                {a.score}/{a.total}
              </span>
              <div className={styles.itemText}>
                <Link href={`/teacher/lessons/${a.lesson_id}?tab=results`} className={styles.itemLink}>
                  {a.student_name || 'Élève'} · {lessonTitle({ title: a.lesson_title })}
                </Link>
                <span className={styles.itemMeta}>{formatRelative(a.completed_at)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
