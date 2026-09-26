import { SpinnerIcon } from '@/components/onboarding/Icons'
import { STEPS } from '@/components/onboarding/options'
import styles from '@/components/onboarding/Steps.module.css'

function primaryLabel({ isSummary, editing, submitting, done, error }) {
  if (!isSummary) return editing ? 'Back to summary' : 'Continue'
  if (done) return 'Opening your lessons…'
  if (submitting) return 'Setting things up…'
  return error ? 'Try again' : 'Start learning'
}

/** Continue / Start learning (+ optional Skip). Sticky at the bottom on mobile. */
export default function StepActions({ step, canContinue, editing, submitting, done, error, busy, showSkip, onSkip }) {
  const isSummary = step === STEPS.SUMMARY
  const loading = isSummary && (submitting || done)

  return (
    <div className={styles.actions}>
      {isSummary && error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}
      {/* While saving, the button stays focusable (aria-disabled) so focus isn't lost; the page ignores repeat submits */}
      <button
        type="submit"
        className={`${styles.primary} ${loading ? styles.primaryBusy : ''}`}
        disabled={!loading && (busy || !canContinue)}
        aria-disabled={loading || undefined}
        aria-busy={loading || undefined}
      >
        {loading ? <SpinnerIcon size={16} className={styles.spin} /> : null}
        {primaryLabel({ isSummary, editing, submitting, done, error })}
      </button>
      {showSkip ? (
        <button type="button" className={styles.secondary} onClick={onSkip} disabled={busy}>
          Skip for now
        </button>
      ) : null}
    </div>
  )
}
