import { useRef } from 'react'
import StepHeading from '@/components/onboarding/StepHeading'
import { CheckIcon } from '@/components/onboarding/Icons'
import { LEVEL_OPTIONS } from '@/components/onboarding/options'
import styles from '@/components/onboarding/Steps.module.css'

/**
 * Native radio group (arrow keys move + select). `onPick` fires only for a
 * pointer/touch selection so the parent can auto-advance; keyboard users
 * confirm with Enter / the Continue button.
 */
export default function StepLevel({ value, onChange, onPick, autoFocus, disabled }) {
  const pointerRef = useRef(false)

  return (
    <>
      <StepHeading
        id="ob-level-title"
        helperId="ob-level-help"
        title="How's your French today?"
        helper="Pick what feels closest. There's no test — Wael will fine-tune it in your first lesson."
        autoFocus={autoFocus}
      />
      <div
        className={`${styles.body} ${styles.levelList}`}
        role="radiogroup"
        aria-labelledby="ob-level-title"
        aria-describedby="ob-level-help"
        aria-required="true"
        onKeyDown={() => {
          pointerRef.current = false
        }}
      >
        {LEVEL_OPTIONS.map((option) => {
          const checked = value === option.code
          const inputId = `ob-level-${option.code}`
          return (
            <label
              key={option.code}
              htmlFor={inputId}
              className={`${styles.levelCard} ${checked ? styles.levelCardOn : ''}`}
              onPointerDown={() => {
                pointerRef.current = true
              }}
              onPointerCancel={() => {
                pointerRef.current = false
              }}
            >
              <input
                id={inputId}
                className={styles.srInput}
                type="radio"
                name="ob-level"
                value={option.code}
                checked={checked}
                disabled={disabled}
                onChange={() => onChange(option.code)}
                onClick={() => {
                  // Arrow-key navigation also dispatches click on radios: only
                  // a real pointer press counts as a "pick"
                  if (!pointerRef.current) return
                  pointerRef.current = false
                  onPick(option.code)
                }}
              />
              <span className={styles.levelBadge} aria-hidden="true">
                {option.badge}
              </span>
              <span className={styles.levelText}>
                <span className={styles.levelTitle}>
                  {option.code === 'unknown' ? null : <span className="sr-only">{option.code}, </span>}
                  {option.title}
                </span>
                <span className={styles.levelDesc}>{option.desc}</span>
              </span>
              <span className={styles.radioDot} aria-hidden="true">
                <CheckIcon size={12} />
              </span>
            </label>
          )
        })}
      </div>
    </>
  )
}
