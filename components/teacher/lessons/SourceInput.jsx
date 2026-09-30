import { useEffect, useId, useRef, useState } from 'react'
import { readClipboardText } from '@/components/teacher/clipboard'
import { formatCount, hasEnoughText } from '@/components/teacher/format'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import counters from '@/components/teacher/NewLesson.module.css'
import styles from '@/components/teacher/lessons/SourceInput.module.css'

/** Appends pasted text after the current value (on a new paragraph), or sets it when empty. */
export function appendText(current, text) {
  const base = (current || '').replace(/\s+$/, '')
  return base ? `${base}\n\n${text}` : text
}

/**
 * Character counter of a transcript / Canva field: ✓ once the API minimum is met, red above
 * `max` (the maximum is only shown when it is exceeded).
 */
export function SourceCounter({ value, max }) {
  const length = (value || '').trim().length
  const over = length > max
  const ok = !over && hasEnoughText(value)
  return (
    <span className={`${counters.counter} ${ok ? counters.counterOk : ''} ${over ? counters.counterOver : ''}`}>
      {ok && <span aria-hidden="true">✓ </span>}
      {over && <span aria-hidden="true">⚠️ </span>}
      {formatCount(length)} caractère{length > 1 ? 's' : ''}
      {over && ` / ${formatCount(max)} max`}
    </span>
  )
}

/** Status shown after « Coller »: what was read (null = not readable, '' = no text). */
export function pasteMessage(text) {
  if (text === null) return 'Presse-papiers inaccessible : colle avec Ctrl+V (⌘V sur Mac).'
  if (!text.trim()) return "Le presse-papiers ne contient pas de texte : copie d'abord le texte, puis réessaie."
  return `Collé ✓ (${formatCount(text.length)} caractères)`
}

/**
 * "Coller" button: pastes the clipboard into a field. When the browser refuses
 * (no permission, http, Firefox…) it focuses the field and says to use Ctrl+V; an
 * empty clipboard is said as such (nothing is pasted).
 * @param {{ targetId: string, onPaste: (text: string) => void, disabled?: boolean, what?: string }} props
 */
export function PasteButton({ targetId, onPaste, disabled = false, what = 'le texte' }) {
  const [message, setMessage] = useState('')
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const paste = async () => {
    const text = await readClipboardText()
    const field = document.getElementById(targetId)
    if (text?.trim()) onPaste(text)
    setMessage(pasteMessage(text))
    field?.focus()
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMessage(''), 5000)
  }

  return (
    <span className={styles.paste}>
      <button
        type="button"
        className={`${ui.btn} ${ui.small} ${bits.blueGhost} ${bits.tap}`}
        onClick={paste}
        disabled={disabled}
        aria-controls={targetId}
      >
        <span aria-hidden="true">📋</span> Coller<span className="sr-only"> {what} depuis le presse-papiers</span>
      </button>
      <span className={styles.pasteMessage} role="status" aria-live="polite">
        {message}
      </span>
    </span>
  )
}

/**
 * Labelled transcript / Canva textarea with counter and "Coller" button (lesson page editor).
 * @param {{ label: string, icon: string, value: string, max: number, onChange: (value: string) => void,
 *   rows?: number, placeholder?: string, invalid?: boolean, describedBy?: string, disabled?: boolean }} props
 */
export default function SourceField({ label, icon, value, max, onChange, rows = 8, placeholder, invalid, describedBy, disabled }) {
  const id = useId()
  return (
    <div className={styles.field}>
      <div className={styles.head}>
        <label htmlFor={id} className={bits.label}>
          <span aria-hidden="true">{icon} </span>
          {label}
        </label>
        <SourceCounter value={value} max={max} />
      </div>
      <textarea
        id={id}
        className={`${bits.textarea} ${invalid ? bits.invalid : ''}`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        spellCheck={false}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      />
      <PasteButton targetId={id} onPaste={(text) => onChange(appendText(value, text))} disabled={disabled} what={label.toLowerCase()} />
    </div>
  )
}
