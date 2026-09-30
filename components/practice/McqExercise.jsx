import { RichTextInline } from '@/components/lesson/RichText'
import SpeakButton from '@/components/student/vocabulary/SpeakButton'
import BlankSentence from '@/components/practice/BlankSentence'
import { splitBlank, speakable, plainText, isLikelyFrench, cx } from '@/components/practice/utils'
import styles from '@/components/practice/Exercises.module.css'

/**
 * Multiple choice (3 choices, order already shuffled by the server).
 * A sentence with a blank is French and its choices fill it; without a blank the
 * sentence is a question and the choices may be English, so `lang` is guessed per text.
 * Choices never show a highlight (a single bold choice would give the answer away).
 * @param {{ exercise: object, value: number|null, onChange: (i: number) => void, feedback: object|null,
 *   speech: { supported: boolean, speak: Function, speakingKey: string|null } }} props
 */
export default function McqExercise({ exercise, value, onChange, feedback, speech }) {
  const parts = splitBlank(exercise.sentence)
  const graded = Boolean(feedback)
  const selected = Number.isInteger(value) ? value : null
  const filled = selected !== null ? plainText(exercise.choices[selected]) : ''
  const sentenceIsFrench = Boolean(parts) || isLikelyFrench(exercise.sentence)
  const choiceLang = (c) => (parts || isLikelyFrench(c) ? 'fr' : undefined)
  // Before "Check" the blank is read as a pause; afterwards with the right answer
  const listenText = sentenceIsFrench
    ? speakable(exercise.sentence, graded && parts ? exercise.choices[exercise.answer] : '')
    : ''

  return (
    <div className={styles.exercise}>
      {exercise.sentence && (
        <div className={styles.sentenceRow}>
          {parts ? (
            <BlankSentence parts={parts} className={styles.sentence}>
              <span
                className={cx(
                  styles.blank,
                  filled && styles.blankFilled,
                  graded && (feedback.correct ? styles.blankGood : styles.blankBad)
                )}
              >
                {filled || (
                  <span className="sr-only" lang="en">
                    blank
                  </span>
                )}
              </span>
            </BlankSentence>
          ) : (
            <p className={styles.sentence} lang={sentenceIsFrench ? 'fr' : undefined}>
              <RichTextInline text={exercise.sentence} />
            </p>
          )}
          <SpeakButton
            speech={speech}
            text={listenText}
            speakKey={`mcq-${exercise.id}`}
            className={styles.listenBtn}
          />
        </div>
      )}

      <div className={styles.choices} role="group" aria-label="Choices">
        {exercise.choices.map((choice, i) => {
          const isSelected = selected === i
          const isAnswer = i === exercise.answer
          return (
            <button
              key={i}
              type="button"
              className={cx(
                styles.choice,
                isSelected && styles.choiceSelected,
                graded && isAnswer && styles.choiceGood,
                graded && isSelected && !isAnswer && styles.choiceBad,
                graded && !isAnswer && !isSelected && styles.choiceDim
              )}
              aria-pressed={isSelected}
              data-choice={i + 1}
              disabled={graded}
              onClick={() => onChange(i)}
            >
              <span className={styles.choiceKey} aria-hidden="true">
                {i + 1}
              </span>
              <RichTextInline text={plainText(choice)} className={styles.choiceText} lang={choiceLang(choice)} />
            </button>
          )
        })}
      </div>
    </div>
  )
}
