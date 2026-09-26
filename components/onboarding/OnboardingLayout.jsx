import styles from '@/components/onboarding/OnboardingLayout.module.css'

/** Page frame: sticky fixed-height header, centered column, small footer. */
export default function OnboardingLayout({ header, footer, children }) {
  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>{header}</div>
      </header>
      <main className={styles.main}>
        <div className={styles.column}>{children}</div>
      </main>
      {footer ? <footer className={styles.footer}>{footer}</footer> : null}
    </div>
  )
}
