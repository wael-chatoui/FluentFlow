import StepHeading from '@/components/onboarding/StepHeading'
import styles from '@/components/onboarding/Steps.module.css'

/**
 * GET /api/me failed: offer a retry instead of an empty flow, which could
 * overwrite the profile of a student who has already onboarded.
 */
export default function LoadError({ message, onRetry }) {
  return (
    <div className={styles.form}>
      <div className={styles.navRow} />
      <div className={styles.pane}>
        <StepHeading
          id="ob-error-title"
          helperId="ob-error-help"
          title="We couldn't load your profile"
          helper="Check your connection, then try again. Nothing you entered is lost."
          autoFocus
        />
        <p className={`${styles.body} ${styles.error}`} role="alert">
          {message}
        </p>
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.primary} onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  )
}
