import styles from '@/components/teacher/NewLesson.module.css'

/**
 * Numbered card of the import form (same look as the "Nouvelle leçon" steps).
 * `htmlFor` turns the title into the field's label.
 */
export default function StepCard({ id, number, tone, title, htmlFor, sub, aside, children, className = '' }) {
  return (
    <section className={`${styles.step} ${styles[tone] || ''} ${className}`} aria-labelledby={id}>
      <div className={styles.stepHead}>
        <span className={styles.stepNumber} aria-hidden="true">{number}</span>
        <div className={styles.stepHeadText}>
          <h2 id={id} className={styles.stepTitle}>
            {htmlFor ? <label htmlFor={htmlFor}>{title}</label> : title}
          </h2>
          {sub && <p className={styles.stepSub}>{sub}</p>}
        </div>
        {aside}
      </div>
      {children}
    </section>
  )
}
