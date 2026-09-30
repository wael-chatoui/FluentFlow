import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/lessons/UndoToast.module.css'

/**
 * Small toast above the mobile tab bar with an « Annuler » action. Announced politely,
 * never steals focus. The parent decides when it disappears.
 * @param {{ message: string, onUndo: () => void, durationMs: number }} props
 *   durationMs drives the shrinking bar (restarted when `message` changes).
 */
export default function UndoToast({ message, onUndo, durationMs }) {
  return (
    <div className={`${styles.toast} no-print`} role="status" aria-live="polite">
      <span className={styles.message}>{message}</span>
      <button type="button" className={`${ui.btn} ${ui.small} ${bits.tap} ${styles.undo}`} onClick={onUndo}>
        Annuler
      </button>
      <span key={message} className={styles.timer} style={{ animationDuration: `${durationMs}ms` }} aria-hidden="true" />
    </div>
  )
}
