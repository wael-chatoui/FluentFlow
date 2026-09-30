import { useEffect, useRef } from 'react'

// Pointer position inside the dialog box? (a press on ::backdrop targets the dialog itself)
function inside(dialog, e) {
  const r = dialog.getBoundingClientRect()
  return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
}

/**
 * Modal dialog on the native <dialog> element (showModal): the rest of the page
 * is inert (no Tab, click or screen-reader escape), it sits in the top layer above
 * sticky bars and toasts, and it inherits CSS variables and fonts from where it is
 * rendered. Mount it to open it, unmount it to close it.
 *
 * - Escape and a press on the backdrop call `onClose` (ignored while `busy`).
 * - Initial focus goes to `initialFocusRef` (else the dialog itself); callers pass
 *   the least destructive button for destructive confirmations.
 * - While `busy`, focus is parked on the dialog (disabled buttons would drop it).
 * - On close, focus returns to `returnFocusRef` or to what was focused before.
 *
 * Style the box with `className` (and `.yourClass::backdrop` for the overlay);
 * styles/globals.css resets the browser's default <dialog> box. aria-modal is
 * implicit for showModal() but stated for older Safari / VoiceOver.
 *
 * @param {{ onClose: () => void, busy?: boolean, role?: 'dialog'|'alertdialog',
 *   labelledBy: string, describedBy?: string, initialFocusRef?: React.RefObject<HTMLElement>,
 *   returnFocusRef?: React.RefObject<HTMLElement>, className?: string, children: React.ReactNode }} props
 */
export default function Dialog({
  onClose,
  busy = false,
  role = 'dialog',
  labelledBy,
  describedBy,
  initialFocusRef,
  returnFocusRef,
  className,
  children,
}) {
  const ref = useRef(null)
  const busyRef = useRef(busy)
  busyRef.current = busy
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const initialFocus = useRef(initialFocusRef)
  initialFocus.current = initialFocusRef
  const pressedBackdrop = useRef(false)

  useEffect(() => {
    const dialog = ref.current
    const returnTo = returnFocusRef?.current || document.activeElement

    // Escape: the page decides (unmounts us) instead of the browser closing the box
    const onCancel = (e) => {
      e.preventDefault()
      if (!busyRef.current) onCloseRef.current?.()
    }
    // Some browsers close anyway on a repeated Escape: keep state and DOM in sync.
    // 'close' is queued: ignore a stale one arriving after the dialog was reopened
    // (effect re-run in React strict mode).
    const onNativeClose = () => {
      if (dialog.open) return
      if (busyRef.current) dialog.showModal()
      else onCloseRef.current?.()
    }
    dialog.addEventListener('cancel', onCancel)
    dialog.addEventListener('close', onNativeClose)
    if (!dialog.open) dialog.showModal()
    ;(initialFocus.current?.current || dialog).focus({ preventScroll: true })

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    return () => {
      dialog.removeEventListener('cancel', onCancel)
      dialog.removeEventListener('close', onNativeClose)
      if (dialog.open) dialog.close()
      document.body.style.overflow = overflow
      if (returnTo && returnTo !== document.body && returnTo.isConnected && typeof returnTo.focus === 'function') {
        returnTo.focus({ preventScroll: true })
      }
    }
    // Mount only: open once, close on unmount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Disabled buttons drop focus: park it on the dialog while busy, then come back
  useEffect(() => {
    const dialog = ref.current
    if (busy) {
      dialog.focus({ preventScroll: true })
    } else if (document.activeElement === dialog || !dialog.contains(document.activeElement)) {
      ;(initialFocus.current?.current || dialog).focus({ preventScroll: true })
    }
  }, [busy])

  return (
    <dialog
      ref={ref}
      className={className}
      role={role === 'alertdialog' ? 'alertdialog' : undefined}
      aria-modal="true"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      aria-busy={busy || undefined}
      tabIndex={-1}
      onPointerDown={(e) => {
        pressedBackdrop.current = e.target === e.currentTarget && !inside(e.currentTarget, e)
      }}
      onClick={(e) => {
        const onBackdrop = pressedBackdrop.current && e.target === e.currentTarget && !inside(e.currentTarget, e)
        pressedBackdrop.current = false
        if (onBackdrop && !busyRef.current) onCloseRef.current?.()
      }}
    >
      {children}
    </dialog>
  )
}
