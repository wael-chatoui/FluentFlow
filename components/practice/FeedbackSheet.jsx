import { forwardRef, useId } from 'react'
import { RichTextInline } from '@/components/lesson/RichText'
import SpeakButton from '@/components/student/vocabulary/SpeakButton'
import BlankSentence from '@/components/practice/BlankSentence'
import { splitBlank, speakable, isLikelyFrench, cx } from '@/components/practice/utils'
import styles from '@/components/practice/PracticePlayer.module.css'
import { Check, TriangleAlert, X } from 'lucide-react'
import Icon from '@/components/ui/Icon'

/** Title text + tone for a graded answer (also used for the aria-live announcement). */
export function describeFeedback(exercise, feedback) {
  if (exercise.type === 'match') {
    const n = feedback.value?.mistakes || 0
    return feedback.correct
      ? { tone: 'good', title: 'Perfect match!' }
      : { tone: 'warn', title: `All matched, with ${n} ${n === 1 ? 'mistake' : 'mistakes'}` }
  }
  // grading.expected = the accepted answer closest to what was typed
  if (feedback.correct && feedback.accentWarning) {
    return { tone: 'good', title: 'Nice — watch the accents:', answer: feedback.expected }
  }
  if (feedback.correct) return { tone: 'good', title: 'Correct!' }
  return { tone: 'bad', title: 'Correct answer:', answer: feedback.expected }
}

/**
 * Slides up over the bottom action bar after "Check".
 * The ref goes to the Continue button (focused by the player). `onContinue` gets the click
 * event: Continue sits where Check was, so the player ignores the end of a double click.
 */
const FeedbackSheet = forwardRef(function FeedbackSheet({ exercise, feedback, onContinue, speech }, ref) {
  const titleId = useId()
  const bodyId = useId()
  const { tone, title, answer } = describeFeedback(exercise, feedback)
  const showExplanation = tone !== 'good' || feedback.accentWarning
  const explanation = showExplanation ? exercise.explanation : ''
  const parts = exercise.type === 'match' ? null : splitBlank(exercise.sentence)
  // Fill-blank: always show (and read) the completed sentence; MCQ: only after a mistake
  const isFill = exercise.type === 'fill_blank'
  const solved = parts && feedback.expected && (isFill || tone === 'bad') ? parts : null
  const answerLang = isFill || parts || isLikelyFrench(answer) ? 'fr' : undefined

  return (
    <div className={cx(styles.sheet, styles[`sheet_${tone}`])} role="region" aria-labelledby={titleId}>
      <div className={styles.sheetInner}>
        <div className={styles.fbMain}>
          <div className={styles.fbHead}>
            <span className={styles.fbIcon} aria-hidden="true">
              <Icon icon={tone === 'good' ? Check : tone === 'warn' ? TriangleAlert : X} size={22} strokeWidth={3} />
            </span>
            <h2 id={titleId} className={styles.fbTitle}>
              {title}
              {answer && (
                <>
                  {' '}
                  <RichTextInline text={answer} className={styles.fbAnswer} lang={answerLang} />
                </>
              )}
            </h2>
          </div>
          <div id={bodyId} className={styles.fbBody}>
            {solved && (
              <div className={styles.fbSentenceRow}>
                <BlankSentence parts={solved} className={styles.fbSentence}>
                  <strong className={styles.fbFill}>{feedback.expected}</strong>
                </BlankSentence>
                {isFill && (
                  <SpeakButton
                    speech={speech}
                    text={speakable(exercise.sentence, feedback.expected)}
                    speakKey={`fill-${exercise.id}`}
                    className={styles.fbListen}
                  />
                )}
              </div>
            )}
            {exercise.type === 'match' && !feedback.correct && (
              <p className={styles.fbText}>You got there! Only a perfect first try counts for your score.</p>
            )}
            {explanation && (
              <p className={styles.fbText}>
                <RichTextInline text={explanation} />
              </p>
            )}
            {tone === 'bad' && <p className={styles.fbNote}>You’ll see this one again at the end.</p>}
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
