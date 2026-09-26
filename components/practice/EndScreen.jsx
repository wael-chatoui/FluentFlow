import { forwardRef } from 'react'
import { expectedText, givenText } from '@/components/practice/utils'
import styles from '@/components/practice/PracticePlayer.module.css'

const CONFETTI_COLORS = ['#FF69B4', '#a855f7', '#10b981', '#f4b400', '#1a73e8', '#ef4444']
// Deterministic pieces (no Math.random → identical on every render)
const CONFETTI = Array.from({ length: 22 }, (_, i) => ({
  left: (i * 37 + 11) % 100,
  delay: (i % 7) * 70,
  rotate: (i * 47) % 360,
  drift: ((i % 5) - 2) * 18,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
}))

function headline(pct) {
  if (pct === 100) return 'Perfect score! 🎉'
  if (pct >= 80) return 'Excellent work! 🎉'
  if (pct >= 60) return 'Great job! 👏'
  if (pct >= 40) return 'Good effort! 💪'
  return 'Keep practising! 💪'
}

function correctAnswer(exercise) {
  if (exercise.type === 'match') return exercise.pairs.map((p) => `${p.fr} = ${p.en}`).join(' · ')
  if (exercise.type === 'fill_blank' && exercise.answers.length > 1) return exercise.answers.join(' / ')
  return expectedText(exercise)
}

/**
 * @param {{ score: number, total: number, mistakes: Array<{ exercise: object, value: any }>,
 *   save: { status: 'idle'|'saving'|'saved'|'error', result: any, error: string }, onRetrySave: () => void }} props
 */
const EndScreen = forwardRef(function EndScreen({ score, total, mistakes, save, onRetrySave }, headingRef) {
  const pct = total > 0 ? Math.round((score / total) * 100) : 0
  const best = save.result && Number.isFinite(save.result.bestScore) ? save.result.bestScore : null
  const bestTotal = Number.isFinite(save.result?.bestTotal) ? save.result.bestTotal : total

  return (
    <div className={styles.end}>
      {pct >= 50 && (
        <div className={styles.confetti} aria-hidden="true">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              style={{
                left: `${c.left}%`,
                background: c.color,
                animationDelay: `${c.delay}ms`,
                '--rot': `${c.rotate}deg`,
                '--drift': `${c.drift}px`,
              }}
            />
          ))}
        </div>
      )}

      <h1 ref={headingRef} tabIndex={-1} className={styles.endTitle}>
        {headline(pct)}
      </h1>

      <div
        className={styles.ring}
        style={{ '--pct': pct }}
        role="img"
        aria-label={`First-try score: ${score} out of ${total} (${pct}%)`}
      >
        <div className={styles.ringInner}>
          <span className={styles.ringScore}>
            {score}
            <span className={styles.ringTotal}>/{total}</span>
          </span>
          <span className={styles.ringLabel}>first try</span>
        </div>
      </div>

      <div className={styles.saveStatus} aria-live="polite">
        {save.status === 'saving' && (
          <span className={styles.saving}>
            <span className="spinner" aria-hidden="true" /> Saving your score…
          </span>
        )}
        {save.status === 'saved' && (
          <span className={styles.saved}>
            ✓ Score saved{best !== null && total > 0 ? ` · Your best: ${best}/${bestTotal}` : ''}
          </span>
        )}
        {save.status === 'error' && (
          <div className={`alert alert-error ${styles.saveError}`} role="alert">
            <span>Couldn&apos;t save your score. {save.error}</span>
            <button type="button" className="btn btn-secondary btn-sm" onClick={onRetrySave}>
              Retry
            </button>
          </div>
        )}
      </div>

      {mistakes.length > 0 ? (
        <section className={styles.review} aria-labelledby="review-title">
          <h2 id="review-title" className={styles.reviewTitle}>
            Review mistakes
          </h2>
          <ul className={styles.reviewList}>
            {mistakes.map(({ exercise, value }) => {
              const given = givenText(exercise, value)
              return (
                <li key={exercise.id} className={styles.reviewItem}>
                  <p className={styles.reviewPrompt}>{exercise.prompt}</p>
                  {exercise.sentence && <p className={styles.reviewSentence}>{exercise.sentence}</p>}
                  {given && exercise.type !== 'match' && (
                    <p className={styles.reviewWrong}>
                      <span className={styles.reviewLabel}>{exercise.type === 'mcq' ? 'You chose' : 'You wrote'}</span> <s>{given}</s>
                    </p>
                  )}
                  {exercise.type === 'match' && <p className={styles.reviewWrong}>{given}</p>}
                  <p className={styles.reviewRight}>
                    <span className={styles.reviewLabel}>Answer</span> {correctAnswer(exercise)}
                  </p>
                  {exercise.explanation && <p className={styles.reviewWhy}>{exercise.explanation}</p>}
                </li>
              )
            })}
          </ul>
        </section>
      ) : (
        <p className={styles.noMistakes}>No mistakes on the first try — bravo !</p>
      )}
    </div>
  )
})

export default EndScreen
