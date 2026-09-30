import styles from '@/components/onboarding/Steps.module.css'

/**
 * Optional free text. Enter = Continue, Shift+Enter = new line.
 * `max` shrinks as chips are picked (they share the stored text): a longer text
 * (e.g. prefilled from the profile) is kept and flagged, never cut.
 */
export default function FreeTextField({ id, label, value, max, onChange, placeholder, onEnter, disabled }) {
  const over = value.trim().length - max
  const showCounter = value.length > max * 0.8
  const errorId = `${id}-error`

  const onKeyDown = (e) => {
    if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    onEnter?.()
  }

  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.fieldLabel}>
        <span>
          {label} <span className={styles.optional}>(optional)</span>
        </span>
        {showCounter ? (
          <span className={`${styles.counter} ${over > 0 ? styles.counterOver : ''}`} aria-hidden="true">
            {value.length}/{max}
          </span>
        ) : null}
      </label>
      <textarea
        id={id}
        className={styles.textarea}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        maxLength={Math.max(max, 0)}
        rows={2}
        enterKeyHint="next"
        aria-invalid={over > 0 || undefined}
        aria-describedby={over > 0 ? errorId : undefined}
        disabled={disabled}
      />
      {over > 0 ? (
        <p id={errorId} className={styles.fieldError} role="alert">
          Too long: please keep it to {max} characters.
        </p>
      ) : null}
    </div>
  )
}
