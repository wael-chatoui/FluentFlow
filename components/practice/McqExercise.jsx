import { splitBlank, cx } from '@/components/practice/utils'
import styles from '@/components/practice/Exercises.module.css'

/**
 * Multiple choice (3 choices, order already shuffled by the server).
 * @param {{ exercise: object, value: number|null, onChange: (i: number) => void, feedback: object|null }} props
 */
export default function McqExercise({ exercise, value, onChange, feedback }) {
  const parts = splitBlank(exercise.sentence)
  const graded = Boolean(feedback)
  const selected = Number.isInteger(value) ? value : null
  const filled = selected !== null ? exercise.choices[selected] : ''

  return (
    <div className={styles.exercise}>
      {parts ? (
        <p className={styles.sentence}>
          {parts[0]}
          <span
            className={cx(
              styles.blank,
              filled && styles.blankFilled,
              graded && (feedback.correct ? styles.blankGood : styles.blankBad)
            )}
          >
            {filled || <span className="sr-only">blank</span>}
          </span>
          {parts[1]}
        </p>
      ) : (
        exercise.sentence && <p className={styles.sentence}>{exercise.sentence}</p>
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
              <span className={styles.choiceKey} aria-hidden="true">{i + 1}</span>
              <span className={styles.choiceText}>{choice}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
