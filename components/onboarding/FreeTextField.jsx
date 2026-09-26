import { FREE_TEXT_MAX } from '@/components/onboarding/options'
import styles from '@/components/onboarding/Steps.module.css'

/** Optional free text. Enter = Continue, Shift+Enter = new line. */
export default function FreeTextField({ id, label, value, onChange, placeholder, onEnter, disabled }) {
  const showCounter = value.length > FREE_TEXT_MAX * 0.8

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
          <span className={styles.counter}>
            {value.length}/{FREE_TEXT_MAX}
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
        maxLength={FREE_TEXT_MAX}
        rows={2}
        enterKeyHint="next"
        disabled={disabled}
      />
    </div>
  )
}
