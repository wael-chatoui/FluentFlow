import styles from '@/components/ui/LoadingScreen.module.css'

/**
 * Full-page loading state: a bouncing 🇫🇷 tile + three brand-colored dots.
 * Fades in after a short delay so fast loads don't flash.
 *
 * @param {{ label?: string, message?: string }} props
 *   label: screen-reader text when there is no visible message (default "Loading…").
 *   message: optional visible text under the dots (also announced).
 */
export default function LoadingScreen({ label = 'Loading…', message = '' }) {
  return (
    <div className={styles.screen} role="status">
      <div className={styles.inner}>
        <div className={styles.art} aria-hidden="true">
          <span className={styles.tile}>🇫🇷</span>
          <span className={styles.shadow} />
        </div>
        <span className={styles.dots} aria-hidden="true">
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
        </span>
        {message ? <p className={styles.message}>{message}</p> : <span className="sr-only">{label}</span>}
      </div>
    </div>
  )
}
