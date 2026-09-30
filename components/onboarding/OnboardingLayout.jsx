import styles from '@/components/onboarding/OnboardingLayout.module.css'

/**
 * Page frame: sticky fixed-height header, centered column, small footer.
 * `className` goes on the root (the page passes its Inter font variable);
 * `overlay` (dialogs) is rendered inside the root so it shares the --ob-* tokens.
 */
export default function OnboardingLayout({ header, footer, overlay, className = '', children }) {
  return (
    <div className={`${styles.page} ${className}`}>
      <header className={styles.header}>
        <div className={styles.headerInner}>{header}</div>
      </header>
      <main className={styles.main}>
        <div className={styles.column}>{children}</div>
      </main>
      {footer ? <footer className={styles.footer}>{footer}</footer> : null}
      {overlay}
    </div>
  )
}
