import { useId, useMemo, useRef } from 'react'
import Dialog from '@/components/ui/Dialog'
import styles from '@/components/teacher/Modal.module.css'
import { X } from 'lucide-react'
import Icon from '@/components/ui/Icon'

const FIELDS = 'input:not([disabled]), textarea:not([disabled]), select:not([disabled])'

/**
 * Form dialog of the teacher area, on components/ui/Dialog (native modal <dialog>:
 * inert background, focus kept inside, focus back to the trigger on close, Escape and
 * backdrop close it unless `busy`). A bottom sheet on phones, a centered card on larger
 * screens. Initial focus goes to the element marked `data-autofocus`, else the first field.
 * @param {{ open: boolean, title: string, icon?: string, onClose: () => void, busy?: boolean,
 *   children: React.ReactNode }} props
 */
export default function Modal({ open, title, icon, onClose, busy = false, children }) {
  if (!open) return null
  return (
    <ModalDialog title={title} icon={icon} onClose={onClose} busy={busy}>
      {children}
    </ModalDialog>
  )
}

function ModalDialog({ title, icon, onClose, busy, children }) {
  const titleId = useId()
  const innerRef = useRef(null)
  // Resolved when Dialog needs it (on open, and after a busy phase): the content may change
  const initialFocusRef = useMemo(
    () => ({
      get current() {
        const inner = innerRef.current
        return inner?.querySelector('[data-autofocus]') || inner?.querySelector(FIELDS) || null
      },
    }),
    []
  )

  return (
    <Dialog onClose={onClose} busy={busy} labelledBy={titleId} initialFocusRef={initialFocusRef} className={styles.dialog}>
      <div ref={innerRef} className={styles.inner}>
        <span className={styles.grabber} aria-hidden="true" />
        <div className={styles.head}>
          {icon && (
            <span className={styles.icon} aria-hidden="true">
              {icon}
            </span>
          )}
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button
            type="button"
            className={styles.close}
            onClick={() => !busy && onClose()}
            disabled={busy}
            aria-label="Fermer"
          >
            <Icon icon={X} size={22} />
          </button>
        </div>
        {children}
      </div>
    </Dialog>
  )
}
