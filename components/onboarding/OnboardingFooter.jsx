import styles from '@/components/onboarding/OnboardingLayout.module.css'

/** Signed-in email + Sign out, and « Delete my account » when `onDelete` is given. */
export default function OnboardingFooter({ email, onSignOut, onDelete, deleteRef, disabled }) {
  return (
    <>
      <div className={styles.footerRow}>
        {email ? (
          <>
            <span className={styles.footerEmail}>
              Signed in as <strong>{email}</strong>
            </span>
            <span className={styles.footerSep} aria-hidden="true">
              ·
            </span>
          </>
        ) : null}
        <button type="button" className={styles.textButton} onClick={onSignOut} disabled={disabled}>
          Sign out
        </button>
      </div>
      {onDelete ? (
        <div className={styles.footerRow}>
          <button
            ref={deleteRef}
            type="button"
            className={`${styles.textButton} ${styles.dangerButton}`}
            onClick={onDelete}
            disabled={disabled}
            aria-haspopup="dialog"
          >
            Delete my account
          </button>
        </div>
      ) : null}
    </>
  )
}
