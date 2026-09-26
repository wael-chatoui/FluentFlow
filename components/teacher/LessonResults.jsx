import { formatDateTime, plural } from '@/components/teacher/format'
import styles from '@/components/teacher/LessonPage.module.css'

/** Practice sessions of a lesson: summary + list (newest first). */
export default function LessonResults({ sessions }) {
  const list = [...(sessions || [])].sort((a, b) =>
    (b.completed_at || '').localeCompare(a.completed_at || '')
  )

  if (list.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon" aria-hidden="true">🎯</div>
        <div className="empty-state-title">Pas encore de résultats</div>
        <div className="empty-state-text">L&apos;élève n&apos;a pas encore fait les exercices de cette leçon.</div>
      </div>
    )
  }

  const ratio = (s) => (s.total ? s.score / s.total : 0)
  const best = list.reduce((a, b) => (ratio(b) > ratio(a) ? b : a), list[0])
  const average = Math.round((list.reduce((sum, s) => sum + ratio(s), 0) / list.length) * 100)

  return (
    <div className={styles.results}>
      <div className={`stats-row ${styles.resultStats}`}>
        <div className="stat-card">
          <div className="stat-value">{list.length}</div>
          <div className="stat-label">{list.length > 1 ? 'Tentatives' : 'Tentative'}</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {best.score}/{best.total}
          </div>
          <div className="stat-label">Meilleur score</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{average} %</div>
          <div className="stat-label">Moyenne</div>
        </div>
      </div>

      <ul className={styles.sessionList}>
        {list.map((s, i) => {
          const pct = Math.round(ratio(s) * 100)
          return (
            <li key={`${s.completed_at}-${i}`} className={styles.session}>
              <div className={styles.sessionTop}>
                <span className={styles.sessionScore}>
                  {s.score}/{s.total}
                  <span className={styles.sessionPct}> · {pct} %</span>
                </span>
                <span className={styles.sessionDate}>{formatDateTime(s.completed_at)}</span>
              </div>
              <div className={styles.meter} aria-hidden="true">
                <div
                  className={`${styles.meterFill} ${pct >= 80 ? styles.good : pct >= 50 ? styles.ok : styles.low}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="sr-only">{plural(s.score, 'bonne réponse', 'bonnes réponses')} sur {s.total}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
