import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Dialog from '@/components/ui/Dialog'
import s from '@/components/admin/common/admin.module.css'
import { useToastHost } from '@/components/admin/common/Toast'
import { cx } from '@/components/admin/common/format'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Back-office modal on components/ui/Dialog (native modal <dialog>: the page behind is
 * inert, Escape / backdrop close it unless `busy`, focus returns to the trigger on close).
 * Bottom sheet on mobile, centered dialog from 768px. Initial focus goes to
 * `initialFocusRef`, else the first control. On close, focus goes to `returnFocusRef`
 * (for a trigger disabled while busy: it had no focus at open), else back to what was
 * focused at open.
 * Toasts shown while it is open render inside it: the page behind is inert and below
 * the top layer.
 *
 * @param {{ open: boolean, title: string, onClose: () => void, busy?: boolean, icon?: string,
 *   tone?: 'danger'|'primary', initialFocusRef?: React.RefObject<HTMLElement>,
 *   returnFocusRef?: React.RefObject<HTMLElement>, describedBy?: string,
 *   children: React.ReactNode, actions?: React.ReactNode }} props
 */
export default function Modal({ open, ...props }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  if (!mounted || !open) return null
  // At the end of <body>: inherits the app's base styles, not the caller's
  return createPortal(<ModalDialog {...props} />, document.body)
}

function ModalDialog({
  title,
  onClose,
  busy = false,
  icon,
  tone = 'primary',
  initialFocusRef,
  returnFocusRef,
  describedBy,
  children,
  actions,
}) {
  const titleId = useId()
  const toastHostRef = useRef(null)
  useToastHost(toastHostRef)
  const danger = tone === 'danger'

  // Read by Dialog on open and after a busy phase, so it follows the current content.
  // The toast host is a direct child of the <dialog>: its parent is the whole box.
  const focusRef = useMemo(
    () => ({
      get current() {
        return initialFocusRef?.current || toastHostRef.current?.parentElement?.querySelector(FOCUSABLE) || null
      },
    }),
    [initialFocusRef]
  )

  return (
    <Dialog
      onClose={onClose}
      busy={busy}
      role={danger ? 'alertdialog' : 'dialog'}
      labelledBy={titleId}
      describedBy={describedBy}
      initialFocusRef={focusRef}
      returnFocusRef={returnFocusRef}
      className={cx(s.dialog, danger && s.danger)}
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
      <div ref={toastHostRef} className={s.toastHost} />
    </Dialog>
  )
}
