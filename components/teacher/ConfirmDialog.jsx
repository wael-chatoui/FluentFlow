import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from '@/components/teacher/ConfirmDialog.module.css'

/**
 * Accessible confirmation modal (replaces window.confirm).
 * Escape / backdrop click cancels, the confirm button gets focus on open,
 * Tab stays inside the dialog and focus returns to the trigger on close.
 *
 * @param {{ open: boolean, title: string, message?: React.ReactNode, confirmLabel?: string,
 *   cancelLabel?: string, danger?: boolean, busy?: boolean,
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
  onConfirm,
  onCancel,
}) {
  const [mounted, setMounted] = useState(false)
  const dialogRef = useRef(null)
  const confirmRef = useRef(null)
  const previousFocus = useRef(null)
  const titleId = useId()
  const messageId = useId()

  // Keep latest callbacks without re-running the key listener effect
  const cancelRef = useRef(onCancel)
  cancelRef.current = onCancel
  const busyRef = useRef(busy)
  busyRef.current = busy

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return undefined
    previousFocus.current = document.activeElement
    const frame = requestAnimationFrame(() => confirmRef.current?.focus())

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!busyRef.current) cancelRef.current?.()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusables = dialogRef.current.querySelectorAll('button:not([disabled])')
      if (focusables.length === 0) return
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)

    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      const prev = previousFocus.current
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus()
    }
  }, [open])

  if (!mounted || !open) return null

  return createPortal(
    <div
      className={`modal-overlay ${styles.overlay}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel?.()
      }}
    >
      <div
        ref={dialogRef}
        className={`modal-content ${styles.dialog}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={message ? messageId : undefined}
      >
        <h2 id={titleId} className={`modal-title ${styles.title}`}>{title}</h2>
        {message && (
          <div id={messageId} className={styles.message}>
            {message}
          </div>
        )}
        <div className={styles.actions}>
          <button type="button" className="btn btn-secondary" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
            aria-busy={busy || undefined}
          >
            {busy && <span className={`spinner ${styles.spinner}`} aria-hidden="true" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
