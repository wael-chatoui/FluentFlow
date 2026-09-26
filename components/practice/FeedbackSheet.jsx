import { forwardRef, useId } from 'react'
import { splitBlank, cx } from '@/components/practice/utils'
import styles from '@/components/practice/PracticePlayer.module.css'

/** The full sentence with the right answer in place of ___, or null. */
function SolvedSentence({ sentence, answer }) {
  const parts = splitBlank(sentence)
  if (!parts || !answer) return null
  return (
    <p className={styles.fbSentence}>
      {parts[0]}
      <strong className={styles.fbFill}>{answer}</strong>
      {parts[1]}
    </p>
  )
}

/** Title text + tone for a graded answer (also used for the aria-live announcement). */
export function describeFeedback(exercise, feedback) {
  if (exercise.type === 'match') {
    const n = feedback.value?.mistakes || 0
    return feedback.correct
      ? { tone: 'good', title: 'Perfect match!' }
      : { tone: 'warn', title: `All matched, with ${n} ${n === 1 ? 'mistake' : 'mistakes'}` }
  }
  if (feedback.correct && feedback.accentWarning) {
    return { tone: 'good', title: 'Nice — watch the accents:', answer: feedback.expected }
  }
  if (feedback.correct) return { tone: 'good', title: 'Correct!' }
  return { tone: 'bad', title: 'Correct answer:', answer: feedback.expected }
}

/**
 * Slides up over the bottom action bar after "Check".
 * The ref goes to the Continue button (focused by the player).
 */
const FeedbackSheet = forwardRef(function FeedbackSheet({ exercise, feedback, onContinue }, ref) {
  const titleId = useId()
  const bodyId = useId()
  const { tone, title, answer } = describeFeedback(exercise, feedback)
  const showExplanation = tone !== 'good' || feedback.accentWarning
  const explanation = showExplanation ? exercise.explanation : ''
  const showSentence = tone === 'bad' || feedback.accentWarning

  return (
    <div className={cx(styles.sheet, styles[`sheet_${tone}`])} role="region" aria-labelledby={titleId}>
      <div className={styles.sheetInner}>
        <div className={styles.fbMain}>
          <div className={styles.fbHead}>
            <span className={styles.fbIcon} aria-hidden="true">
              {tone === 'good' ? '✓' : tone === 'warn' ? '!' : '✕'}
            </span>
            <h2 id={titleId} className={styles.fbTitle}>
              {title}
              {answer && (
                <>
                  {' '}
                  <span className={styles.fbAnswer} lang="fr">{answer}</span>
                </>
              )}
            </h2>
          </div>
          <div id={bodyId} className={styles.fbBody}>
            {showSentence && exercise.type !== 'match' && (
              <SolvedSentence sentence={exercise.sentence} answer={answer} />
            )}
            {exercise.type === 'match' && !feedback.correct && (
              <p className={styles.fbText}>You got there! Only a perfect first try counts for your score.</p>
            )}
            {explanation && <p className={styles.fbText}>{explanation}</p>}
            {tone === 'bad' && <p className={styles.fbNote}>You&apos;ll see this one again at the end.</p>}
          </div>
        </div>
        <button
          ref={ref}
          type="button"
          className={cx(styles.bigBtn, styles[`continue_${tone}`])}
          onClick={onContinue}
          aria-describedby={bodyId}
        >
          Continue
        </button>
      </div>
    </div>
  )
})

export default FeedbackSheet
