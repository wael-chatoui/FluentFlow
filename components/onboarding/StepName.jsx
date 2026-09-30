import StepHeading from '@/components/onboarding/StepHeading'
import { NAME_MAX } from '@/components/onboarding/options'
import styles from '@/components/onboarding/Steps.module.css'

export default function StepName({ value, onChange, autoFocus, disabled }) {
  const nearLimit = value.length >= NAME_MAX - 20

  return (
    <>
      <StepHeading
        id="ob-name-title"
        helperId="ob-name-help"
        title="What should we call you?"
        helper="This is how Wael and your lesson recaps will address you."
        autoFocus={autoFocus}
      />
      <div className={styles.body}>
        <label htmlFor="ob-name" className="sr-only">
          Your name
        </label>
        <input
          id="ob-name"
          className={styles.bigInput}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Your name"
          autoComplete="name"
          autoCapitalize="words"
          spellCheck={false}
          enterKeyHint="next"
          maxLength={NAME_MAX}
          aria-describedby="ob-name-help"
          disabled={disabled}
          required
        />
        {nearLimit ? (
          <p className={styles.hint} aria-live="polite">
            {value.length}/{NAME_MAX} characters
          </p>
        ) : null}
      </div>
    </>
  )
}
