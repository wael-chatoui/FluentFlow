import { forwardRef, useId } from 'react'
import { RichTextInline } from '@/components/lesson/RichText'
import BlankSentence from '@/components/practice/BlankSentence'
import { correctAnswerText, givenText, splitBlank, isLikelyFrench } from '@/components/practice/utils'
import styles from '@/components/practice/PracticePlayer.module.css'

// Brand palette (--st-* tokens)
const CONFETTI_COLORS = ['#58cc02', '#1cb0f6', '#ff9600', '#ce82ff', '#ff69b4', '#ffc800']
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
  return 'Keep practicing! 💪'
}

function MistakeSentence({ exercise }) {
  if (!exercise.sentence) return null
  const parts = splitBlank(exercise.sentence)
  if (parts) {
    return (
      <BlankSentence parts={parts} className={styles.reviewSentence}>
        <span className={styles.reviewGap}>
          <span className="sr-only" lang="en">
            blank
          </span>
        </span>
      </BlankSentence>
    )
  }
  return (
    <p className={styles.reviewSentence} lang={isLikelyFrench(exercise.sentence) ? 'fr' : undefined}>
      <RichTextInline text={exercise.sentence} />
    </p>
  )
}

function SaveStatus({ save, total, preview, savedText, onRetrySave }) {
  if (preview) {
    return (
      <span className={styles.saving} lang="fr">
        <span aria-hidden="true">👁️</span> Aperçu — score non enregistré
      </span>
    )
  }
  if (save.status === 'saving') {
    return (
      <span className={styles.saving}>
        <span className={styles.miniSpinner} aria-hidden="true" /> Saving your score…
      </span>
    )
  }
  if (save.status === 'saved') {
    const best = Number.isFinite(save.result?.bestScore) ? save.result.bestScore : null
    const bestTotal = Number.isFinite(save.result?.bestTotal) ? save.result.bestTotal : total
    return (
      <span className={styles.saved}>
        ✓{' '}
        {typeof savedText === 'function'
          ? savedText(save.result)
          : `Score saved${best !== null && total > 0 ? ` · Your best: ${best}/${bestTotal}` : ''}`}
      </span>
    )
  }
  if (save.status === 'error') {
    return (
      <div className={styles.saveError} role="alert">
        <span>Couldn’t save your score. {save.error}</span>
        <button type="button" className={styles.smallBtn} onClick={onRetrySave}>
          Retry
        </button>
      </div>
    )
  }
  return null
}

/**
 * @param {{ score: number, total: number, title?: string, mistakes: Array<{ exercise: object, value: any }>,
 *   save: { status: 'idle'|'saving'|'saved'|'error', result: any, error: string }, onRetrySave: () => void,
 *   savedText?: ((result: any) => string) | null, preview?: boolean }} props
 *   savedText: optional replacement for "Score saved · Your best: …" (e.g. review mode).
 */
const EndScreen = forwardRef(function EndScreen(
  { score, total, title, mistakes, save, onRetrySave, savedText, preview },
  headingRef
) {
  const reviewTitleId = useId()
  const pct = total > 0 ? Math.round((score / total) * 100) : 0

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
      {title && <p className={styles.endLesson}>{title}</p>}

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
        <SaveStatus save={save} total={total} preview={preview} savedText={savedText} onRetrySave={onRetrySave} />
      </div>

      {mistakes.length > 0 ? (
        <section className={styles.review} aria-labelledby={reviewTitleId}>
          <h2 id={reviewTitleId} className={styles.reviewTitle}>
            Review mistakes
          </h2>
          <ul className={styles.reviewList} role="list">
            {mistakes.map(({ exercise, value }) => {
              const given = givenText(exercise, value)
              const answer = correctAnswerText(exercise)
              // Answers that fill a blank are French; other MCQ choices may be English
              const fillsBlank = exercise.type === 'fill_blank' || Boolean(splitBlank(exercise.sentence))
              const langOf = (text) => (fillsBlank || (exercise.type === 'mcq' && isLikelyFrench(text)) ? 'fr' : undefined)
              return (
                <li key={exercise.id} className={styles.reviewItem}>
                  {typeof exercise.lessonTitle === 'string' && exercise.lessonTitle && (
                    <p className={styles.reviewFrom}>From: {exercise.lessonTitle}</p>
                  )}
                  <p className={styles.reviewPrompt}>
                    <RichTextInline text={exercise.prompt} />
                  </p>
                  <MistakeSentence exercise={exercise} />
                  {given && exercise.type !== 'match' && (
                    <p className={styles.reviewWrong}>
                      <span className={styles.reviewLabel}>{exercise.type === 'mcq' ? 'You chose' : 'You wrote'}</span>{' '}
                      <s lang={langOf(given)}>{given}</s>
                    </p>
                  )}
                  {exercise.type === 'match' && <p className={styles.reviewWrong}>{given}</p>}
                  <p className={styles.reviewRight}>
                    <span className={styles.reviewLabel}>Answer</span>{' '}
                    <span lang={langOf(answer)}>{answer}</span>
                  </p>
                  {exercise.explanation && (
                    <p className={styles.reviewWhy}>
                      <RichTextInline text={exercise.explanation} />
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      ) : (
        <p className={styles.noMistakes}>No mistakes on the first try — bravo!</p>
      )}
    </div>
  )
})

export default EndScreen
