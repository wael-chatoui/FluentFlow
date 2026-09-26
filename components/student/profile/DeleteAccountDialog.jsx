import { useEffect, useId, useRef } from 'react'
import ui from '@/components/student/ui.module.css'
import styles from '@/components/student/profile/Profile.module.css'

/**
 * Accessible confirm dialog (role="alertdialog"): focus starts on the safe
 * button, Tab is trapped, Escape / backdrop cancel (unless busy), page scroll is locked.
 * The caller restores focus to the trigger on close.
 */
export default function DeleteAccountDialog({ busy, onCancel, onConfirm }) {
  const titleId = useId()
  const descId = useId()
  const dialogRef = useRef(null)
  const cancelRef = useRef(null)
  const busyRef = useRef(busy)
  busyRef.current = busy
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  useEffect(() => {
    cancelRef.current?.focus()
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [])

  // Buttons get disabled while deleting: keep focus inside the dialog
  useEffect(() => {
    if (busy) dialogRef.current?.focus()
  }, [busy])

  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      if (!busyRef.current) onCancelRef.current()
      return
    }
    if (e.key !== 'Tab') return
    const focusable = Array.from(dialogRef.current?.querySelectorAll('button:not([disabled])') || [])
    if (focusable.length === 0) {
      e.preventDefault()
      return
    }
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className={styles.overlay} onClick={() => !busyRef.current && onCancelRef.current()}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <span className={styles.dialogEmoji} aria-hidden="true">
          😢
        </span>
        <h2 id={titleId} className={styles.dialogTitle}>
          Delete your account?
        </h2>
        <p id={descId} className={styles.dialogText}>
          This permanently deletes your account, your lesson recaps and your progress. This can&apos;t be undone.
        </p>
        <div className={styles.dialogActions}>
          <button ref={cancelRef} type="button" className={`${ui.btn} ${ui.ghost} ${ui.block}`} onClick={onCancel} disabled={busy}>
            Keep my account
          </button>
          <button type="button" className={`${ui.btn} ${ui.red} ${ui.block}`} onClick={onConfirm} disabled={busy} aria-busy={busy}>
            {busy ? 'Deleting…' : 'Delete my account'}
          </button>
        </div>
      </div>
    </div>
  )
}
