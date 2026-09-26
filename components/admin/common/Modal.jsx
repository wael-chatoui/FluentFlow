import { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import s from '@/components/admin/common/admin.module.css'
import { cx } from '@/components/admin/common/format'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Accessible modal: bottom sheet on mobile, centered dialog from 768px.
 * Escape / backdrop click closes (unless busy), focus is trapped inside and
 * restored to the trigger on close. Focus goes to `initialFocusRef` or the
 * first focusable element.
 *
 * @param {{ open: boolean, title: string, onClose: () => void, busy?: boolean, icon?: string,
 *   tone?: 'danger'|'primary', initialFocusRef?: React.RefObject<HTMLElement>,
 *   describedBy?: string, children: React.ReactNode, actions?: React.ReactNode }} props
 */
export default function Modal({ open, title, onClose, busy = false, icon, tone = 'primary', initialFocusRef, describedBy, children, actions }) {
  const [mounted, setMounted] = useState(false)
  const dialogRef = useRef(null)
  const previousFocus = useRef(null)
  const titleId = useId()

  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const busyRef = useRef(busy)
  busyRef.current = busy

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return undefined
    previousFocus.current = document.activeElement
    const frame = requestAnimationFrame(() => {
      const target = initialFocusRef?.current || dialogRef.current?.querySelector(FOCUSABLE) || dialogRef.current
      target?.focus()
    })

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        if (!busyRef.current) closeRef.current?.()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const focusables = Array.from(dialogRef.current.querySelectorAll(FOCUSABLE))
      if (focusables.length === 0) {
        e.preventDefault()
        return
      }
      const first = focusables[0]
      const last = focusables[focusables.length - 1]
      if (e.shiftKey && (document.activeElement === first || !dialogRef.current.contains(document.activeElement))) {
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
    // initialFocusRef is a ref: stable
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!mounted || !open) return null

  return createPortal(
    <div
      className={s.overlay}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose?.()
      }}
    >
      <div
        ref={dialogRef}
        className={cx(s.dialog, tone === 'danger' && s.danger)}
        role={tone === 'danger' ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={describedBy}
        tabIndex={-1}
      >
        <span className={s.grabber} aria-hidden="true" />
        <div className={s.dialogHead}>
          {icon && (
            <span className={s.dialogIcon} aria-hidden="true">
              {icon}
            </span>
          )}
          <h2 id={titleId} className={s.dialogTitle}>
            {title}
          </h2>
        </div>
        <div className={s.dialogBody}>{children}</div>
        {actions && <div className={s.dialogActions}>{actions}</div>}
      </div>
    </div>,
    document.body
  )
}
