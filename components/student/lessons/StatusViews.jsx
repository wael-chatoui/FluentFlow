import ui from '@/components/ui/ui.module.css'
import styles from '@/components/student/lessons/StatusViews.module.css'
import { CircleAlert } from 'lucide-react'
import Icon from '@/components/ui/Icon'

/** Friendly empty state: big pictogram (lucide component), title, text and an optional action. */
export function EmptyState({ icon, title, text, action, headingLevel = 2, tone = 'blue' }) {
  const Heading = `h${headingLevel}`
  return (
    <div className={`${styles.empty} ${styles[tone] || ''}`}>
      <span className={styles.emptyEmoji} aria-hidden="true">
        <Icon icon={icon} size={40} />
      </span>
      <Heading className={styles.emptyTitle}>{title}</Heading>
      {text && <p className={styles.emptyText}>{text}</p>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  )
}

/** Load error with a retry button. */
export function ErrorCard({ title = 'Something went wrong', message, onRetry }) {
  return (
    <div className={styles.error} role="alert">
      <span className={styles.errorEmoji} aria-hidden="true">
        <Icon icon={CircleAlert} size={24} />
      </span>
      <div className={styles.errorBody}>
        <p className={styles.errorTitle}>{title}</p>
        {message && <p className={styles.errorText}>{message}</p>}
      </div>
      {onRetry && (
        <button type="button" className={`${ui.btn} ${ui.small} ${ui.ghost} ${styles.errorBtn}`} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}
