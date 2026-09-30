import EmptyNote from '@/components/teacher/lessons/EmptyNote'
import { formatDateTime, plural } from '@/components/teacher/format'
import styles from '@/components/teacher/lessons/LessonResults.module.css'

function tone(pct) {
  return pct >= 80 ? styles.good : pct >= 50 ? styles.ok : styles.low
}

function OlderNote({ count }) {
  if (!count) return null
  return (
    <p className={styles.older}>
      <span aria-hidden="true">🕰️ </span>
      {plural(count, 'essai')} sur une version précédente de la leçon (avant la dernière génération ou
      modification des exercices) : non comptés ici.
    </p>
  )
}

/**
 * Practice sessions of the current version of a lesson: summary tiles + score bars (newest first).
 * @param {{ sessions: object[], olderCount?: number }} props  olderCount = sessions on previous versions
 */
export default function LessonResults({ sessions, olderCount = 0 }) {
  const list = [...(sessions || [])].sort((a, b) =>
    (b.completed_at || '').localeCompare(a.completed_at || '')
  )

  if (list.length === 0) {
    return (
      <div className={styles.results}>
        <EmptyNote
          emoji="🎯"
          tone="orange"
          title="Pas encore de résultats"
          text={
            olderCount
              ? "L'élève n'a pas encore refait les exercices de cette version."
              : "L'élève n'a pas encore fait les exercices de cette leçon."
          }
        />
        <OlderNote count={olderCount} />
      </div>
    )
  }

  const ratio = (s) => (s.total ? s.score / s.total : 0)
  const best = list.reduce((a, b) => (ratio(b) > ratio(a) ? b : a), list[0])
  const average = Math.round((list.reduce((sum, s) => sum + ratio(s), 0) / list.length) * 100)

  return (
    <div className={styles.results}>
      <dl className={styles.stats}>
        <div className={`${styles.stat} ${styles.statBlue}`}>
          <dt className={styles.statLabel}>{list.length > 1 ? 'Tentatives' : 'Tentative'}</dt>
          <dd className={styles.statValue}>
            <span className={styles.statIcon} aria-hidden="true">🔁</span>
            {list.length}
          </dd>
        </div>
        <div className={`${styles.stat} ${styles.statGreen}`}>
          <dt className={styles.statLabel}>Meilleur score</dt>
          <dd className={styles.statValue}>
            <span className={styles.statIcon} aria-hidden="true">🏆</span>
            {best.score}/{best.total}
          </dd>
        </div>
        <div className={`${styles.stat} ${styles.statOrange}`}>
          <dt className={styles.statLabel}>Moyenne</dt>
          <dd className={styles.statValue}>
            <span className={styles.statIcon} aria-hidden="true">📊</span>
            {average} %
          </dd>
        </div>
      </dl>

      <ul className={styles.sessions}>
        {list.map((s, i) => {
          const pct = Math.round(ratio(s) * 100)
          return (
            <li key={`${s.completed_at}-${i}`} className={styles.session}>
              <div className={styles.sessionTop}>
                <span className={`${styles.score} ${tone(pct)}`}>
                  {s.score}/{s.total}
                  <span className={styles.pct}>{pct} %</span>
                </span>
                <span className={styles.date}>{formatDateTime(s.completed_at)}</span>
              </div>
              <div className={styles.meter} aria-hidden="true">
                <div className={`${styles.meterFill} ${tone(pct)}`} style={{ width: `${Math.max(pct, 3)}%` }} />
              </div>
              <span className="sr-only">{plural(s.score, 'bonne réponse', 'bonnes réponses')} sur {s.total}</span>
            </li>
          )
        })}
      </ul>
      <OlderNote count={olderCount} />
    </div>
  )
}
