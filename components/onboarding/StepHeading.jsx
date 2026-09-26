import { useEffect, useRef } from 'react'
import styles from '@/components/onboarding/Steps.module.css'

/** Question + helper line. Takes focus on mount when `autoFocus` (step change). */
export default function StepHeading({ id, helperId, title, helper, autoFocus }) {
  const ref = useRef(null)

  useEffect(() => {
    if (autoFocus) ref.current?.focus({ preventScroll: true })
    // Mount only: each step remounts its heading
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <h1 ref={ref} id={id} className={styles.heading} tabIndex={-1}>
        {title}
      </h1>
      {helper ? (
        <p id={helperId} className={styles.helper}>
          {helper}
        </p>
      ) : null}
    </>
  )
}
