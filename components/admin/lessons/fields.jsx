import { useId, useState } from 'react'
import { cx } from '@/components/admin/common/format'
import admin from '@/components/admin/common/admin.module.css'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/admin/lessons/editor.module.css'
import { ArrowDown, ArrowUp, Plus, X } from 'lucide-react'
import Icon from '@/components/ui/Icon'

/**
 * Label + control + hint + error, wired with aria-invalid / aria-describedby.
 * `children(props)` receives the props to spread on the control.
 */
export function Field({ label, hint, error, className, children, srLabel = false }) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-err` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cx(admin.field, className)}>
      <label htmlFor={id} className={cx(admin.label, srLabel && 'sr-only')}>
        {label}
      </label>
      {children({
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': describedBy,
        className: cx(admin.input, error && admin.invalid),
      })}
      {hint && (
        <p id={hintId} className={admin.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className={admin.fieldError}>
          {error}
        </p>
      )}
    </div>
  )
}

export function TextField({ label, value, onChange, error, hint, maxLength, placeholder, type = 'text', className, srLabel, inputMode, lang }) {
  return (
    <Field label={label} hint={hint} error={error} className={className} srLabel={srLabel}>
      {(props) => (
        <input
          {...props}
          type={type}
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          inputMode={inputMode}
          lang={lang}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  )
}

export function TextArea({ label, value, onChange, error, hint, maxLength, placeholder, rows = 3, className, lang }) {
  return (
    <Field label={label} hint={hint} error={error} className={className}>
      {(props) => (
        <textarea
          {...props}
          className={cx(props.className, admin.textarea)}
          value={value}
          rows={rows}
          maxLength={maxLength}
          placeholder={placeholder}
          lang={lang}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Field>
  )
}

/** ↑ ↓ ✕ controls for a row of a list editor. */
export function RowControls({ index, count, onMove, onRemove, label }) {
  return (
    <div className={styles.rowControls}>
      <button
        type="button"
        className={styles.iconBtn}
        onClick={() => onMove(index - 1)}
        disabled={index === 0}
        aria-label={`Monter ${label}`}
        title="Monter"
      >
        <Icon icon={ArrowUp} size={18} />
      </button>
      <button
        type="button"
        className={styles.iconBtn}
        onClick={() => onMove(index + 1)}
        disabled={index === count - 1}
        aria-label={`Descendre ${label}`}
        title="Descendre"
      >
        <Icon icon={ArrowDown} size={18} />
      </button>
      <button
        type="button"
        className={cx(styles.iconBtn, styles.iconDanger)}
        onClick={onRemove}
        aria-label={`Supprimer ${label}`}
        title="Supprimer"
      >
        <Icon icon={X} size={18} />
      </button>
    </div>
  )
}

/** "+ Ajouter …" button that disables itself at the limit. */
export function AddButton({ onClick, children, count, max }) {
  const full = max !== undefined && count >= max
  return (
    <button
      type="button"
      className={cx(ui.btn, ui.small, admin.tap, admin.blueGhost, styles.addBtn)}
      onClick={onClick}
      disabled={full}
    >
      <Icon icon={Plus} size={16} strokeWidth={3} /> {children}
      {max !== undefined && <span className={styles.addCount}>{count}/{max}</span>}
    </button>
  )
}

/**
 * Chips editor for a list of short strings (Enter or "Ajouter" adds, ✕ removes).
 */
export function ChipsInput({ label, values, onChange, max, maxLength = 200, placeholder, error, hint, lang }) {
  const [text, setText] = useState('')
  const id = useId()
  const hintId = `${id}-hint`
  const errorId = error ? `${id}-err` : undefined
  const full = max !== undefined && values.length >= max
  const exists = values.some((v) => v.trim().toLowerCase() === text.trim().toLowerCase())

  const add = () => {
    const v = text.replace(/\s+/g, ' ').trim()
    if (!v || full || exists) return
    onChange([...values, v.slice(0, maxLength)])
    setText('')
  }

  return (
    <div className={admin.field}>
      <label htmlFor={id} className={admin.label}>
        {label}
      </label>
      {values.length > 0 && (
        <ul className={styles.chipList} aria-label={label}>
          {values.map((v, i) => (
            <li key={`${i}-${v}`} className={styles.chipItem} lang={lang}>
              <span className={styles.chipText}>{v}</span>
              <button
                type="button"
                className={styles.chipRemove}
                onClick={() => onChange(values.filter((_, j) => j !== i))}
                aria-label={`Retirer « ${v} »`}
              >
                <Icon icon={X} size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.chipAdd}>
        <input
          id={id}
          className={cx(admin.input, error && admin.invalid)}
          value={text}
          maxLength={maxLength}
          placeholder={full ? 'Limite atteinte' : placeholder}
          disabled={full}
          lang={lang}
          aria-invalid={error ? true : undefined}
          aria-describedby={[errorId, hintId].filter(Boolean).join(' ')}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
        />
        <button
          type="button"
          className={cx(ui.btn, ui.small, admin.tap, admin.blueGhost)}
          onClick={add}
          disabled={full || !text.trim() || exists}
        >
          Ajouter
        </button>
      </div>
      <p id={hintId} className={admin.hint}>
        {hint || 'Entrée pour ajouter.'}
        {max !== undefined && ` ${values.length}/${max}.`}
        {exists && text.trim() && ' Déjà dans la liste.'}
      </p>
      {error && (
        <p id={errorId} className={admin.fieldError}>
          {error}
        </p>
      )}
    </div>
  )
}
