import ui from '@/components/ui/ui.module.css'
import styles from '@/components/teacher/dashboard/StatTiles.module.css'
import { BookOpen, Calendar, Users } from 'lucide-react'
import Icon from '@/components/ui/Icon'

/**
 * Three colorful stat tiles for the teacher dashboard.
 * @param {{ stats: { students: number, lessons: number, seenThisMonth: number } }} props
 */
export default function StatTiles({ stats }) {
  const tiles = [
    { key: 'students', tone: styles.blue, icon: Users, value: stats.students, label: stats.students > 1 ? 'Élèves' : 'Élève' },
    { key: 'lessons', tone: styles.purple, icon: BookOpen, value: stats.lessons, label: 'Leçons au total' },
    { key: 'month', tone: styles.green, icon: Calendar, value: stats.seenThisMonth, label: 'Élèves vus ce mois-ci' },
  ]

  return (
    <dl className={styles.tiles}>
      {tiles.map((t, i) => (
        <div key={t.key} className={`${styles.tile} ${t.tone}`} style={{ '--i': i }}>
          <dt className={styles.label}>
            <span className={styles.icon} aria-hidden="true">
              <Icon icon={t.icon} size={18} />
            </span>
            {t.label}
          </dt>
          <dd className={styles.value}>{t.value}</dd>
        </div>
      ))}
    </dl>
  )
}

export function StatTilesSkeleton() {
  return (
    <div className={styles.tiles} aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className={`${styles.tile} ${styles.skeleton}`}>
          <span className={ui.skel} style={{ width: '75%', height: 12, marginTop: 8 }} />
          <span className={ui.skel} style={{ width: 44, height: 30 }} />
          <span className={`${ui.skel} ${styles.icon}`} />
        </div>
      ))}
    </div>
  )
}
