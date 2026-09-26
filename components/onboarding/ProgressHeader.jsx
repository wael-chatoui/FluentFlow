import styles from '@/components/onboarding/ProgressHeader.module.css'

/**
 * Brand mark + "Step n of total" + segmented progress bar.
 * `step` is 0-based; pass null (skeleton) to show an empty bar without a label.
 */
export default function ProgressHeader({ step, total }) {
  const known = Number.isInteger(step)
  const current = known ? step + 1 : 0

  return (
    <div className={styles.root}>
      <div className={styles.row}>
        <span className={styles.brand}>
          <span className={styles.mark} aria-hidden="true">
            P
          </span>
          <span className={styles.brandName}>Preply Lessons</span>
        </span>
        {known ? (
          <span className={styles.stepLabel} aria-hidden="true">
            Step {current} of {total}
          </span>
        ) : null}
      </div>
      <div
        className={styles.segments}
        style={{ gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` }}
        role={known ? 'progressbar' : undefined}
        aria-label={known ? 'Onboarding progress' : undefined}
        aria-valuemin={known ? 1 : undefined}
        aria-valuemax={known ? total : undefined}
        aria-valuenow={known ? current : undefined}
        aria-valuetext={known ? `Step ${current} of ${total}` : undefined}
        aria-hidden={known ? undefined : 'true'}
      >
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={styles.segment}>
            <span className={`${styles.fill} ${i < current ? styles.fillOn : ''}`} />
          </span>
        ))}
      </div>
    </div>
  )
}
