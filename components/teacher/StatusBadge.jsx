import styles from '@/components/teacher/Teacher.module.css'

const STATUS = {
  published: { label: 'Publiée', tone: styles.statusGreen },
  generating: { label: 'En cours', tone: styles.statusBlue },
  failed: { label: 'Échec', tone: styles.statusRed },
}

/** Lesson status pill: Publiée (green) / En cours (blue) / Échec (red). */
export default function StatusBadge({ status }) {
  const meta = STATUS[status] || { label: status || 'Inconnu', tone: styles.statusGray }
  return (
    <span className={`${styles.status} ${meta.tone}`}>
      <span className={styles.statusDot} aria-hidden="true" />
      {meta.label}
    </span>
  )
}
