import styles from '@/components/teacher/Teacher.module.css'

/** Label + tone of a lesson's status pill (generation status + visibility for the student). */
export function lessonStatusMeta({ status, hidden = false, stale = false }) {
  if (status === 'generating') {
    return stale
      ? { label: 'Bloquée', tone: styles.statusOrange }
      : { label: 'En cours', tone: `${styles.statusBlue} ${styles.pulsing}` }
  }
  if (status === 'failed') return { label: 'Échec', tone: styles.statusRed }
  if (status === 'published') {
    return hidden ? { label: 'Brouillon', tone: styles.statusOrange } : { label: 'Publiée', tone: styles.statusGreen }
  }
  return { label: status || 'Inconnu', tone: styles.statusGray }
}

/**
 * Lesson status pill: Publiée (green) / Brouillon (orange, hidden from the student) /
 * En cours (blue) / Bloquée (orange, generation stuck) / Échec (red).
 * @param {{ status: string, hidden?: boolean, stale?: boolean }} props
 */
export default function StatusBadge({ status, hidden = false, stale = false }) {
  const meta = lessonStatusMeta({ status, hidden, stale })
  return (
    <span className={`${styles.status} ${meta.tone}`}>
      <span className={styles.statusDot} aria-hidden="true" />
      {meta.label}
    </span>
  )
}
