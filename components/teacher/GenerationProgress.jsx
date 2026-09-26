import { useId } from 'react'
import { useElapsedSeconds } from '@/components/teacher/hooks'
import { formatElapsed } from '@/components/teacher/format'
import styles from '@/components/teacher/GenerationProgress.module.css'

// Step i becomes active once `from` seconds have elapsed (the AI call itself is opaque).
const STEPS = [
  { from: 0, label: 'Lecture de la transcription…', icon: '📖' },
  { from: 8, label: 'Correction des notes Canva…', icon: '🎨' },
  { from: 20, label: 'Rédaction du bilan…', icon: '✍️' },
  { from: 40, label: 'Création des exercices…', icon: '🧩' },
  { from: 75, label: 'Vérification et publication…', icon: '🚀' },
]

function currentStep(elapsed) {
  let index = 0
  STEPS.forEach((step, i) => {
    if (elapsed >= step.from) index = i
  })
  return index
}

/**
 * Playful progress card shown while the AI generates a lesson (30–120 s):
 * bouncing robot, chunky progress bar, step checklist and elapsed timer.
 * All motion is disabled under prefers-reduced-motion.
 * @param {{ startedAt: number | null, heading?: string, note?: React.ReactNode }} props
 */
export default function GenerationProgress({ startedAt, heading = 'Génération de la leçon…', note }) {
  const headingId = useId()
  const elapsed = useElapsedSeconds(startedAt)
  const active = currentStep(elapsed)
  // Asymptotic bar: ~50 % at 35 s, ~90 % at 2 min, never 100 % before the answer arrives.
  const percent = Math.min(96, Math.round((1 - Math.exp(-elapsed / 50)) * 100))

  return (
    <section className={styles.panel} aria-labelledby={headingId}>
      <div className={styles.top}>
        <div className={styles.mascot} aria-hidden="true">
          <span className={styles.robot}>🤖</span>
          <span className={`${styles.sparkle} ${styles.s1}`}>✨</span>
          <span className={`${styles.sparkle} ${styles.s2}`}>✨</span>
          <span className={`${styles.sparkle} ${styles.s3}`}>⭐</span>
        </div>
        <div className={styles.headText}>
          <h2 id={headingId} className={styles.heading}>{heading}</h2>
          <p className={styles.sub}>
            Cela prend en général 30 secondes à 2 minutes. Garde cette page ouverte.
          </p>
        </div>
      </div>

      <div className={styles.barRow}>
        <div
          className={styles.bar}
          role="progressbar"
          aria-label="Progression estimée"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
        >
          <div className={styles.barFill} style={{ width: `${Math.max(percent, 6)}%` }} />
        </div>
        <span className={styles.timer}>
          <span aria-hidden="true">⏱️ </span>
          <span className="sr-only">Temps écoulé : </span>
          {formatElapsed(elapsed)}
        </span>
      </div>

      <p className={styles.current} role="status" aria-live="polite">
        <span aria-hidden="true">{STEPS[active].icon} </span>
        {STEPS[active].label}
      </p>

      <ol className={styles.steps}>
        {STEPS.map((step, i) => {
          const state = i < active ? 'done' : i === active ? 'active' : 'todo'
          return (
            <li key={step.label} className={`${styles.step} ${styles[state]}`}>
              <span className={styles.dot} aria-hidden="true">
                {state === 'done' ? '✓' : state === 'active' ? <span className={styles.pulse} /> : i + 1}
              </span>
              <span className={styles.stepLabel}>
                {step.label.replace('…', '')}
                <span className="sr-only">
                  {state === 'done' ? ' (terminé)' : state === 'active' ? ' (en cours)' : ' (à venir)'}
                </span>
              </span>
            </li>
          )
        })}
      </ol>

      {elapsed >= 150 && (
        <p className={styles.slow}>
          <span aria-hidden="true">🐢 </span>
          C&apos;est plus long que d&apos;habitude… La génération continue, merci de patienter encore un peu.
        </p>
      )}
      {note && <div className={styles.note}>{note}</div>}
    </section>
  )
}
