import { useId, useRef } from 'react'
import Dialog from '@/components/ui/Dialog'
import { cx } from '@/components/practice/utils'
import styles from '@/components/practice/PracticePlayer.module.css'

/**
 * "Quit this practice?" dialog on the shared native modal (components/ui/Dialog):
 * the player behind is inert. The safe choice (stay) is focused first; Escape
 * or a click on the backdrop also stays. The player moves the focus back itself.
 * @param {{ title: string, stayLabel: string, quitLabel: string, onStay: () => void, onQuit: () => void }} props
 */
export default function ConfirmExit({ title, stayLabel, quitLabel, onStay, onQuit }) {
  const titleId = useId()
  const stayRef = useRef(null)

  return (
    <Dialog
      onClose={onStay}
      role="alertdialog"
      labelledBy={titleId}
      initialFocusRef={stayRef}
      className={styles.dialog}
    >
      <span className={styles.dialogEmoji} aria-hidden="true">
        🥺
      </span>
      <h2 id={titleId} className={styles.dialogTitle}>
        {title}
      </h2>
      <div className={styles.dialogActions}>
        <button ref={stayRef} type="button" className={cx(styles.bigBtn, styles.primaryBtn)} onClick={onStay}>
          {stayLabel}
        </button>
        <button type="button" className={cx(styles.bigBtn, styles.quitBtn)} onClick={onQuit}>
          {quitLabel}
        </button>
      </div>
    </Dialog>
  )
}
