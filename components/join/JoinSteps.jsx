import { Check, ChevronRight } from 'lucide-react'
import Icon from '@/components/ui/Icon'
import styles from '@/components/join/JoinSteps.module.css'

// Breadcrumb of the invitation flow: /join/<token> (welcome, sign in) then /onboarding?from=join
export const JOIN_STEPS = [
  { key: 'welcome', label: 'Welcome' },
  { key: 'signin', label: 'Sign in' },
  { key: 'profile', label: 'Your profile' },
  { key: 'start', label: 'Start learning' },
]

/**
 * Stepper « Welcome › Sign in › Your profile › Start learning ».
 * Steps before `current` are done (check mark), `current` is marked aria-current="step".
 * @param {{ current: 'welcome'|'signin'|'profile'|'start', className?: string }} props
 */
export default function JoinSteps({ current, className = '' }) {
  const currentIndex = Math.max(
    0,
    JOIN_STEPS.findIndex((s) => s.key === current)
  )
  return (
    <nav className={`${styles.nav} ${className}`} aria-label="Joining steps">
      <ol className={styles.list}>
        {JOIN_STEPS.map((step, i) => {
          const state = i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'todo'
          return (
            <li key={step.key} className={`${styles.step} ${styles[state]}`} aria-current={state === 'current' ? 'step' : undefined}>
              <span className={styles.dot} aria-hidden="true">
                {state === 'done' ? <Icon icon={Check} size={13} strokeWidth={3} /> : i + 1}
              </span>
              <span className={styles.label}>
                {step.label}
                {state === 'done' && <span className="sr-only"> (done)</span>}
              </span>
              {i < JOIN_STEPS.length - 1 && <Icon icon={ChevronRight} size={14} className={styles.sep} />}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
