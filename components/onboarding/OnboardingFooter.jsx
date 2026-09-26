import styles from '@/components/onboarding/OnboardingLayout.module.css'

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
    </>
  )
}
