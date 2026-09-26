import { useEffect, useId, useRef } from 'react'
import { SpinnerIcon } from '@/components/onboarding/Icons'
import styles from '@/components/onboarding/ConfirmDialog.module.css'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Accessible modal confirm: role="dialog" + aria-modal, focus trapped inside,
 * Escape / backdrop close (unless busy), focus returns to `returnFocusRef` on close.
 * Render it only while open.
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
  const dialogRef = useRef(null)
  const cancelRef = useRef(null)
  const busyRef = useRef(busy)
  busyRef.current = busy
  const onCancelRef = useRef(onCancel)
  onCancelRef.current = onCancel

  // Initial focus, scroll lock, focus restore
  useEffect(() => {
    const returnTo = returnFocusRef?.current
    cancelRef.current?.focus()
    const { body } = document
    const previousOverflow = body.style.overflow
    body.style.overflow = 'hidden'
    return () => {
      body.style.overflow = previousOverflow
      if (returnTo && typeof returnTo.focus === 'function') {
        requestAnimationFrame(() => returnTo.focus({ preventScroll: true }))
      }
    }
    // Mount only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Disabled buttons drop focus: park it on the dialog while busy, then come back
  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (busy) dialog.focus({ preventScroll: true })
    else if (!dialog.contains(document.activeElement) || document.activeElement === dialog) {
      cancelRef.current?.focus({ preventScroll: true })
    }
  }, [busy])

  // Escape anywhere closes (the dialog may not hold focus, e.g. after a busy state)
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape' || busyRef.current) return
      e.preventDefault()
      onCancelRef.current?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const onKeyDown = (e) => {
    if (e.key !== 'Tab') return
    const nodes = Array.from(dialogRef.current?.querySelectorAll(FOCUSABLE) || [])
    if (!nodes.length) {
      e.preventDefault()
      dialogRef.current?.focus()
      return
    }
    const first = nodes[0]
    const last = nodes[nodes.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === first || !dialogRef.current.contains(active))) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && (active === last || !dialogRef.current.contains(active))) {
      e.preventDefault()
      first.focus()
    }
  }

  return (
    <div className={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && !busy && onCancel()}>
      <div
        ref={dialogRef}
        className={styles.dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
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
      </div>
    </div>
  )
}
