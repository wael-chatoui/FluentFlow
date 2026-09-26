import Link from 'next/link'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/teacher/Teacher.module.css'

const TONES = {
  blue: styles.toneBlue,
  green: styles.toneGreen,
  orange: styles.toneOrange,
  purple: styles.tonePurple,
  pink: styles.tonePink,
  yellow: styles.toneYellow,
  red: styles.toneRed,
}

/**
 * Centered error / not-found / empty panel (big emoji bubble, title, text, actions).
 * @param {{ icon?: string, title: string, text?: React.ReactNode, onRetry?: () => void,
 *   retryLabel?: string, link?: { href: string, label: string }, role?: string,
 *   tone?: 'blue'|'green'|'orange'|'purple'|'pink'|'yellow'|'red',
 *   action?: React.ReactNode, headingLevel?: 1|2|3 }} props
 *   `tone` defaults to red for alerts, blue otherwise. `action` renders extra custom actions.
 */
export default function PageState({
  icon = '⚠️',
  title,
  text,
  onRetry,
  retryLabel = 'Réessayer',
  link,
  role,
  tone,
  action,
  headingLevel,
}) {
  const toneClass = TONES[tone || (role === 'alert' ? 'red' : 'blue')] || styles.toneBlue
  const Title = headingLevel ? `h${headingLevel}` : 'div'

  return (
    <div className={`${styles.state} ${toneClass}`} role={role}>
      <div className={styles.stateIcon} aria-hidden="true">{icon}</div>
      <Title className={styles.stateTitle}>{title}</Title>
      {text && <div className={styles.stateText}>{text}</div>}
      {(onRetry || link || action) && (
        <div className={styles.stateActions}>
          {action}
          {onRetry && (
            <button type="button" className={`${ui.btn} ${ui.blue}`} onClick={onRetry}>
              <span aria-hidden="true">🔄</span> {retryLabel}
            </button>
          )}
          {link && (
            <Link href={link.href} className={`${ui.btn} ${ui.ghost}`}>
              {link.label}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
