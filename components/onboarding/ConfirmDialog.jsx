import { useId, useRef } from 'react'
import Dialog from '@/components/ui/Dialog'
import { SpinnerIcon } from '@/components/onboarding/Icons'
import styles from '@/components/onboarding/ConfirmDialog.module.css'

/**
 * Onboarding confirm on the shared native modal (components/ui/Dialog): the page
 * behind is inert, Escape / backdrop close (unless busy), « Cancel » gets focus
 * first and focus returns to `returnFocusRef` on close.
 * Render it only while open, inside OnboardingLayout (for the --ob-* tokens).
 */
export default function ConfirmDialog({
  title,
  description,
  confirmLabel,
  busyLabel,
  cancelLabel = 'Cancel',
  busy = false,
  error = '',
  danger = false,
  onCancel,
  onConfirm,
  returnFocusRef,
}) {
  const titleId = useId()
  const descId = useId()
  const cancelRef = useRef(null)

  return (
    <Dialog
      onClose={onCancel}
      busy={busy}
      role={danger ? 'alertdialog' : 'dialog'}
      labelledBy={titleId}
      describedBy={descId}
      initialFocusRef={cancelRef}
      returnFocusRef={returnFocusRef}
      className={styles.dialog}
    >
      <h2 id={titleId} className={styles.title}>
        {title}
      </h2>
      <p id={descId} className={styles.description}>
        {description}
      </p>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button ref={cancelRef} type="button" className={styles.cancel} onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={`${styles.confirm} ${danger ? styles.danger : ''}`}
          onClick={onConfirm}
          disabled={busy}
          aria-busy={busy || undefined}
        >
          {busy ? <SpinnerIcon size={15} className={styles.spin} /> : null}
          {busy ? busyLabel || confirmLabel : confirmLabel}
        </button>
      </div>
    </Dialog>
  )
}
