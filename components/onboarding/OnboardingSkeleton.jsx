import OnboardingLayout from '@/components/onboarding/OnboardingLayout'
import ProgressHeader from '@/components/onboarding/ProgressHeader'
import { STEP_COUNT } from '@/components/onboarding/options'
import styles from '@/components/onboarding/OnboardingLayout.module.css'

/** Neutral placeholder rendered on the server and until we know who the user is. */
export default function OnboardingSkeleton({ className }) {
  return (
    <OnboardingLayout className={className} header={<ProgressHeader step={null} total={STEP_COUNT} />}>
      <div className={styles.skeleton} role="status">
        <span className="sr-only">Loading…</span>
        <div className={`${styles.skeletonBar} ${styles.skeletonTitle}`} aria-hidden="true" />
        <div className={`${styles.skeletonBar} ${styles.skeletonLine}`} aria-hidden="true" />
        <div className={`${styles.skeletonBar} ${styles.skeletonInput}`} aria-hidden="true" />
      </div>
    </OnboardingLayout>
  )
}
