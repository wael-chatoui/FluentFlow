import styles from '@/components/teacher/Teacher.module.css'

const STATUS = {
  published: { label: 'Publiée', className: 'badge badge-green' },
  generating: { label: 'En cours', className: 'badge badge-blue' },
  failed: { label: 'Échec', className: `badge ${styles.badgeRed}` },
}

/** Lesson status badge: Publiée / En cours / Échec. */
export default function StatusBadge({ status }) {
  const meta = STATUS[status] || { label: status || 'Inconnu', className: 'badge badge-gray' }
  return <span className={meta.className}>{meta.label}</span>
}
