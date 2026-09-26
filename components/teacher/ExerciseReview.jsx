import { Fragment, useState } from 'react'
import ConfirmDialog from '@/components/teacher/ConfirmDialog'
import { EXERCISE_TYPE_LABELS } from '@/components/teacher/format'
import { BLANK } from '@/utils/lesson/schema'
import styles from '@/components/teacher/ExerciseReview.module.css'

const TYPE_BADGE = {
  mcq: 'badge badge-blue',
  fill_blank: 'badge badge-pink',
  match: 'badge badge-green',
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

// Plain text with optional **bold** markers (never HTML)
function Inline({ text }) {
  if (!text) return null
  const parts = String(text).split(/\*\*(.+?)\*\*/g)
  return parts.map((part, i) =>
    i % 2 === 1 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>
  )
}

// Sentence with the ___ blank rendered as a visible slot
function Sentence({ text, fill }) {
  if (!text) return null
  const pieces = String(text).split(BLANK)
  return (
    <p className={styles.sentence}>
      {pieces.map((piece, i) => (
        <Fragment key={i}>
          <Inline text={piece} />
          {i < pieces.length - 1 && (
            <span className={styles.blank}>
              {fill ? fill : <span className="sr-only">(blanc)</span>}
            </span>
          )}
        </Fragment>
      ))}
    </p>
  )
}

function McqBody({ exercise }) {
  return (
    <>
      <Sentence text={exercise.sentence} />
      <ol className={styles.choices}>
        {(exercise.choices || []).map((choice, i) => {
          const correct = i === exercise.answer
          return (
            <li key={i} className={`${styles.choice} ${correct ? styles.correct : ''}`}>
              <span className={styles.letter} aria-hidden="true">{correct ? '✓' : LETTERS[i]}</span>
              <span className={styles.choiceText}>
                <Inline text={choice} />
                {correct && <span className="sr-only"> (bonne réponse)</span>}
              </span>
            </li>
          )
        })}
      </ol>
    </>
  )
}

function FillBlankBody({ exercise }) {
  const answers = exercise.answers || []
  return (
    <>
      <Sentence text={exercise.sentence} fill={answers[0]} />
      <div className={styles.answers}>
        <span className={styles.answersLabel}>
          {answers.length > 1 ? 'Réponses acceptées :' : 'Réponse attendue :'}
        </span>
        <ul className={styles.chips}>
          {answers.map((a) => (
            <li key={a} className={styles.chip}>{a}</li>
          ))}
        </ul>
      </div>
      {exercise.hint && (
        <p className={styles.hint}>
          <span aria-hidden="true">🔎 </span>Indice : <Inline text={exercise.hint} />
        </p>
      )}
    </>
  )
}

function MatchBody({ exercise }) {
  return (
    <ul className={styles.pairs}>
      {(exercise.pairs || []).map((pair) => (
        <li key={`${pair.fr}|${pair.en}`} className={styles.pair}>
          <span className={styles.pairFr} lang="fr">{pair.fr}</span>
          <span className={styles.pairArrow} aria-hidden="true">↔</span>
          <span className="sr-only"> : </span>
          <span className={styles.pairEn} lang="en">{pair.en}</span>
        </li>
      ))}
    </ul>
  )
}

const BODIES = { mcq: McqBody, fill_blank: FillBlankBody, match: MatchBody }

/**
 * Teacher review of a lesson's exercises, with the right answers shown.
 * @param {{ exercises: object[], onRemove?: (id: string) => void, removingIds?: Set<string>, disabled?: boolean }} props
 */
export default function ExerciseReview({ exercises, onRemove, removingIds, disabled = false }) {
  const [pending, setPending] = useState(null)
  const list = Array.isArray(exercises) ? exercises : []

  if (list.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon" aria-hidden="true">🧩</div>
        <div className="empty-state-title">Aucun exercice</div>
        <div className="empty-state-text">
          Cette leçon n&apos;a pas d&apos;exercices. Tu peux la régénérer pour en créer.
        </div>
      </div>
    )
  }

  return (
    <>
      <ol className={styles.list}>
        {list.map((exercise, index) => {
          const Body = BODIES[exercise.type]
          const removing = removingIds?.has(exercise.id)
          return (
            <li key={exercise.id} className={styles.item}>
              <div className={styles.head}>
                <span className={styles.number}>{index + 1}</span>
                <span className={TYPE_BADGE[exercise.type] || 'badge badge-gray'}>
                  {EXERCISE_TYPE_LABELS[exercise.type] || exercise.type}
                </span>
                {onRemove && (
                  <button
                    type="button"
                    className={`btn btn-ghost btn-sm ${styles.remove}`}
                    onClick={() => setPending(exercise)}
                    disabled={disabled || removing}
                    aria-label={`Supprimer l'exercice ${index + 1}`}
                  >
                    🗑️ Supprimer
                  </button>
                )}
              </div>
              {exercise.prompt && (
                <p className={styles.prompt}>
                  <Inline text={exercise.prompt} />
                </p>
              )}
              {Body ? <Body exercise={exercise} /> : <p className={styles.hint}>Type d&apos;exercice inconnu.</p>}
              {exercise.explanation && (
                <p className={styles.explanation}>
                  <span aria-hidden="true">💡 </span>
                  <Inline text={exercise.explanation} />
                </p>
              )}
            </li>
          )
        })}
      </ol>

      <ConfirmDialog
        open={Boolean(pending)}
        title="Supprimer cet exercice ?"
        message="L'exercice sera retiré de la leçon de l'élève. Cette action est définitive."
        confirmLabel="Supprimer"
        danger
        onConfirm={() => {
          const target = pending
          setPending(null)
          if (target) onRemove?.(target.id)
        }}
        onCancel={() => setPending(null)}
      />
    </>
  )
}
