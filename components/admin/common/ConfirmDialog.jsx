import { useEffect, useId, useRef, useState } from 'react'
import ui from '@/components/ui/ui.module.css'
import s from '@/components/admin/common/admin.module.css'
import Modal from '@/components/admin/common/Modal'
import { cx } from '@/components/admin/common/format'
import { CircleHelp, TriangleAlert } from 'lucide-react'

function normalize(text) {
  return (text || '').trim().toLowerCase()
}

/**
 * Confirmation dialog (bottom sheet on mobile). With `requireText`, the user must
 * type that exact text (trimmed, case-insensitive) before the confirm button enables.
 * A destructive dialog (tone 'danger') opens with the focus on « Annuler », so an
 * Enter pressed too fast never confirms it.
 *
 * @param {{ open: boolean, title: string, message?: React.ReactNode, confirmLabel?: string,
 *   cancelLabel?: string, tone?: 'danger'|'primary', requireText?: string, busy?: boolean,
 *   icon?: string, onConfirm: () => void, onCancel: () => void }} props
 */
export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  tone = 'primary',
  requireText,
  busy = false,
  icon,
  onConfirm,
  onCancel,
}) {
  const inputId = useId()
  const messageId = useId()
  const inputRef = useRef(null)
  const cancelRef = useRef(null)
  const confirmRef = useRef(null)
  const [typed, setTyped] = useState('')

  useEffect(() => {
    if (open) setTyped('')
  }, [open])

  const danger = tone === 'danger'
  const matches = !requireText || normalize(typed) === normalize(requireText)
  const canConfirm = matches && !busy

  const submit = (e) => {
    e?.preventDefault()
    if (canConfirm) onConfirm?.()
  }

  return (
    <Modal
      open={open}
      title={title}
      onClose={onCancel}
      busy={busy}
      tone={tone}
      icon={icon || (danger ? TriangleAlert : CircleHelp)}
      initialFocusRef={requireText ? inputRef : danger ? cancelRef : confirmRef}
      describedBy={message ? messageId : undefined}
      actions={
        <>
          <button ref={cancelRef} type="button" className={cx(ui.btn, s.tap)} onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={cx(ui.btn, danger ? ui.red : ui.blue, s.tap)}
            onClick={submit}
            disabled={!canConfirm}
            aria-busy={busy || undefined}
          >
            {busy && <span className={s.spinner} aria-hidden="true" />}
            {confirmLabel}
          </button>
        </>
      }
    >
      {message && <div id={messageId}>{message}</div>}
      {requireText && (
        <form className={s.field} onSubmit={submit} noValidate>
          <label htmlFor={inputId} className={s.label}>
            Pour confirmer, tape <span className={s.mono}>{requireText}</span>
          </label>
          <input
            ref={inputRef}
            id={inputId}
            className={s.input}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            disabled={busy}
          />
        </form>
      )}
    </Modal>
  )
}
