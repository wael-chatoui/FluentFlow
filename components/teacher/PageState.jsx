import Link from 'next/link'
import styles from '@/components/teacher/Teacher.module.css'

/**
 * Centered error / not-found / empty panel.
 * @param {{ icon?: string, title: string, text?: React.ReactNode, onRetry?: () => void,
 *   retryLabel?: string, link?: { href: string, label: string }, role?: string }} props
 */
export default function PageState({ icon = '⚠️', title, text, onRetry, retryLabel = 'Réessayer', link, role }) {
  return (
    <div className={styles.state} role={role}>
      <div className={styles.stateIcon} aria-hidden="true">{icon}</div>
      <div className={styles.stateTitle}>{title}</div>
      {text && <div className={styles.stateText}>{text}</div>}
      {(onRetry || link) && (
        <div className={styles.stateActions}>
          {onRetry && (
            <button type="button" className="btn btn-primary" onClick={onRetry}>
              {retryLabel}
            </button>
          )}
          {link && (
            <Link href={link.href} className="btn btn-secondary">
              {link.label}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
