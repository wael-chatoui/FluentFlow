import { useId } from 'react'
import { formatLessonDate } from '@/components/lesson/format'
import MasteryRing from '@/components/student/lessons/MasteryRing'
import { bestPct, shortDate } from '@/components/student/lessons/progress'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/student/home/Progress.module.css'

// Bars are colored by score (not by lesson) so red always means "needs work"
function scoreStyle(pct) {
  const tone = pct >= 80 ? 'green' : pct >= 50 ? 'orange' : 'red'
  return { '--accent': `var(--st-${tone})`, '--accent-dark': `var(--st-${tone}-dark)`, '--accent-bg': `var(--st-${tone}-bg)` }
}

function masteryMessage(pct) {
  if (pct === null) return 'Practice a lesson to see your mastery.'
  if (pct === 100) return 'Perfect — you’ve mastered everything!'
  if (pct >= 80) return 'Excellent! You know your lessons well.'
  if (pct >= 50) return 'Good progress — keep practicing!'
  return 'Every practice makes it stick. Keep going!'
}

/**
 * Progress only (no streaks / XP): overall mastery, lessons + words counts,
 * and a small bar chart of best scores.
 * @param {{ stats: { lessons: number, mastery: number|null, words: number }, history: object[] }} props
 *   words = distinct words & expressions (same number as the Words page)
 */
export default function ProgressCard({ stats, history }) {
  const titleId = useId()
  const chartId = useId()

  return (
    <section className={`${ui.card} ${styles.card}`} aria-labelledby={titleId}>
      <h2 id={titleId} className={styles.heading}>
        <span aria-hidden="true">📈</span> Your progress
      </h2>

      <div className={styles.top}>
        <MasteryRing
          pct={stats.mastery}
          size={112}
          stroke={12}
          label={stats.mastery === null ? 'Overall mastery: not started yet' : `Overall mastery: ${stats.mastery}%`}
        >
          <span className={styles.ringInner}>
            <span className={styles.ringValue}>{stats.mastery === null ? '—' : `${stats.mastery}%`}</span>
            <span className={styles.ringLabel}>mastery</span>
          </span>
        </MasteryRing>

        <p className={styles.message}>{masteryMessage(stats.mastery)}</p>
      </div>

      <dl className={styles.stats}>
        <div className={`${styles.stat} ${styles.statBlue}`}>
          <dt className={styles.statLabel}>
            <span aria-hidden="true">📚 </span>Lessons
          </dt>
          <dd className={styles.statValue}>{stats.lessons}</dd>
        </div>
        <div className={`${styles.stat} ${styles.statPurple}`}>
          <dt className={styles.statLabel}>
            <span aria-hidden="true">🔤 </span>Words
          </dt>
          <dd className={styles.statValue}>{stats.words}</dd>
        </div>
      </dl>

      <div className={styles.chartBlock}>
        <h3 id={chartId} className={styles.chartTitle}>
          Your scores
        </h3>
        {history.length === 0 ? (
          <p className={styles.chartEmpty}>Your best scores will show up here after you practice.</p>
        ) : (
          <ol className={styles.chart} aria-labelledby={chartId} aria-describedby={`${chartId}-desc`}>
            {history.map((lesson) => {
              const pct = bestPct(lesson) ?? 0
              const title = lesson.title || 'Lesson recap'
              const date = formatLessonDate(lesson.lesson_date, { month: 'long', day: 'numeric' })
              return (
                <li key={lesson.id} className={styles.col} style={scoreStyle(pct)}>
                  <span className="sr-only">
                    {title}
                    {date ? `, ${date}` : ''}: best score {pct}%
                  </span>
                  <span className={styles.value} aria-hidden="true">
                    {pct}
                  </span>
                  <span className={styles.barWrap} aria-hidden="true">
                    <span className={styles.bar} style={{ height: `${Math.max(pct, 3)}%` }} />
                  </span>
                  <span className={styles.date} aria-hidden="true">
                    {shortDate(lesson.lesson_date).replace(' ', '\n')}
                  </span>
                </li>
              )
            })}
          </ol>
        )}
        {history.length > 0 && (
          <p id={`${chartId}-desc`} className={styles.chartNote}>
            Best score (%) per lesson, oldest to newest
          </p>
        )}
      </div>
    </section>
  )
}

export function ProgressSkeleton() {
  return (
    <div className={`${ui.card} ${styles.card}`} aria-hidden="true">
      <span className={ui.skel} style={{ width: 150, height: 22 }} />
      <div className={styles.top}>
        <span className={ui.skel} style={{ width: 112, height: 112, borderRadius: '50%', flex: 'none' }} />
        <span className={ui.skel} style={{ flex: 1, height: 36 }} />
      </div>
      <div className={styles.stats}>
        <span className={ui.skel} style={{ height: 62, borderRadius: 14 }} />
        <span className={ui.skel} style={{ height: 62, borderRadius: 14 }} />
      </div>
      <div className={styles.chartBlock}>
        <span className={ui.skel} style={{ width: 100, height: 16 }} />
        <span className={ui.skel} style={{ height: 150, marginTop: 12, borderRadius: 14 }} />
      </div>
    </div>
  )
}
