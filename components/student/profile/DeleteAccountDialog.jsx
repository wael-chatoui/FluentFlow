import { useId, useRef } from 'react'
import Dialog from '@/components/ui/Dialog'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/student/profile/Profile.module.css'
import { Frown } from 'lucide-react'
import Icon from '@/components/ui/Icon'

/**
 * "Delete your account?" confirm on the shared native modal (components/ui/Dialog):
 * the page behind is inert, Escape / backdrop cancel (unless busy), and the safe
 * « Keep my account » button gets focus first so a stray Enter never deletes anything.
 * Focus returns to `returnFocusRef` (the Delete button) on close.
 * Render it only while open.
 */
export default function DeleteAccountDialog({ busy, onCancel, onConfirm, returnFocusRef }) {
  const titleId = useId()
  const descId = useId()
  const cancelRef = useRef(null)

  return (
    <Dialog
      onClose={onCancel}
      busy={busy}
      role="alertdialog"
      labelledBy={titleId}
      describedBy={descId}
      initialFocusRef={cancelRef}
      returnFocusRef={returnFocusRef}
      className={styles.dialog}
    >
      <span className={styles.dialogEmoji} aria-hidden="true">
        <Icon icon={Frown} size={32} />
      </span>
      <h2 id={titleId} className={styles.dialogTitle}>
        Delete your account?
      </h2>
      <p id={descId} className={styles.dialogText}>
        This permanently deletes your account, your lesson recaps and your progress. This can’t be undone.
      </p>
      <div className={styles.dialogActions}>
        <button ref={cancelRef} type="button" className={`${ui.btn} ${ui.ghost} ${ui.block}`} onClick={onCancel} disabled={busy}>
          Keep my account
        </button>
        <button
          type="button"
          className={`${ui.btn} ${ui.red} ${ui.block}`}
          onClick={onConfirm}
          disabled={busy}
          aria-busy={busy || undefined}
        >
          {busy ? 'Deleting…' : 'Delete my account'}
        </button>
      </div>
    </Dialog>
  )
}
