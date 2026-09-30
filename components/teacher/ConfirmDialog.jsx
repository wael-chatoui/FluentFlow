import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Dialog from '@/components/ui/Dialog'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/ConfirmDialog.module.css'

/**
 * Accessible confirmation dialog (replaces window.confirm): a bottom sheet on
 * mobile, a centered modal on desktop, built on components/ui/Dialog (native
 * modal <dialog>: the page behind is inert, Escape / backdrop cancel).
 * Initial focus: « Annuler » for destructive confirmations (`danger`), so a stray
 * Enter never deletes anything; the confirm button otherwise. Focus returns to
 * the trigger on close.
 *
 * @param {{ open: boolean, title: string, message?: React.ReactNode, confirmLabel?: string,
 *   cancelLabel?: string, danger?: boolean, busy?: boolean, error?: string, icon?: string,
 *   onConfirm: () => void, onCancel: () => void }} props
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  danger = false,
  busy = false,
  error = '',
  icon,
  onConfirm,
  onCancel,
}) {
  const [mounted, setMounted] = useState(false)
  const cancelRef = useRef(null)
  const confirmRef = useRef(null)
  const titleId = useId()
  const messageId = useId()

  useEffect(() => setMounted(true), [])

  if (!mounted || !open) return null

  const emoji = icon || (danger ? '🗑️' : '🤔')

  // Rendered at the end of <body> so it inherits the app's base styles, not the caller's
  return createPortal(
    <Dialog
      onClose={onCancel}
      busy={busy}
      role={danger ? 'alertdialog' : 'dialog'}
      labelledBy={titleId}
      describedBy={message ? messageId : undefined}
      initialFocusRef={danger ? cancelRef : confirmRef}
      className={`${styles.dialog} ${danger ? styles.danger : ''} no-print`}
    >
      <span className={styles.grabber} aria-hidden="true" />
      <span className={styles.icon} aria-hidden="true">{emoji}</span>
      <h2 id={titleId} className={styles.title}>{title}</h2>
      {message && (
        <div id={messageId} className={styles.message}>
          {message}
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <button ref={cancelRef} type="button" className={`${ui.btn} ${styles.button}`} onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          ref={confirmRef}
          type="button"
          className={`${ui.btn} ${danger ? ui.red : ui.blue} ${styles.button}`}
          onClick={onConfirm}
          disabled={busy}
          aria-busy={busy || undefined}
        >
          {busy && <span className={bits.spinner} aria-hidden="true" />}
          {confirmLabel}
        </button>
      </div>
    </Dialog>,
    document.body
  )
}
