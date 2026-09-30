import { Fragment } from 'react'
import { RichTextInline } from '@/components/lesson/RichText'
import EmptyNote from '@/components/teacher/lessons/EmptyNote'
import { EXERCISE_TYPE_LABELS } from '@/components/teacher/format'
import { BLANK } from '@/utils/lesson/schema'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/ExerciseReview.module.css'
import { ArrowLeftRight, Check, CircleDot, Info, Lightbulb, ListChecks, Pencil, TextCursorInput, Trash2 } from 'lucide-react'
import Icon from '@/components/ui/Icon'

// Type pill color + icon: QCM blue, Trous orange, Association purple
const TYPE_META = {
  mcq: { tone: styles.blue, icon: CircleDot },
  fill_blank: { tone: styles.orange, icon: TextCursorInput },
  match: { tone: styles.purple, icon: ArrowLeftRight },
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

// RichTextInline trims its text: keep the spaces around the blank
function Piece({ text }) {
  return (
    <>
      {/^\s/.test(text) && ' '}
      <RichTextInline text={text} />
      {/\S\s+$/.test(text) && ' '}
    </>
  )
}

// Sentence with the ___ blank rendered as a visible slot
function Sentence({ text, fill }) {
  if (!text) return null
  const pieces = String(text).split(BLANK)
  return (
    <p className={styles.sentence} lang="fr">
      {pieces.map((piece, i) => (
        <Fragment key={i}>
          <Piece text={piece} />
          {i < pieces.length - 1 && (
            <span className={`${styles.blank} ${fill ? styles.blankFilled : ''}`}>
              {fill ? <RichTextInline text={fill} /> : <span className="sr-only">(blanc)</span>}
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
              <span className={styles.letter} aria-hidden="true">
                {correct ? <Icon icon={Check} size={16} strokeWidth={3} /> : LETTERS[i]}
              </span>
              <span className={styles.choiceText}>
                <RichTextInline text={choice} />
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
          {answers.map((a, i) => (
            <li key={i} className={styles.chip} lang="fr">
              <Icon icon={Check} size={16} strokeWidth={3} className={styles.inlineIcon} />
              <RichTextInline text={a} />
            </li>
          ))}
        </ul>
      </div>
      {exercise.hint && (
        <p className={styles.hint}>
          <Icon icon={Lightbulb} size={16} className={styles.inlineIcon} />
          <strong>Indice :</strong> <RichTextInline text={exercise.hint} />
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
          <span className={`${styles.tile} ${styles.tileFr}`} lang="fr">
            <RichTextInline text={pair.fr} />
          </span>
          <span className={styles.pairArrow} aria-hidden="true">
            <Icon icon={ArrowLeftRight} size={18} />
          </span>
          <span className="sr-only"> : </span>
          <span className={styles.tile} lang="en">
            <RichTextInline text={pair.en} />
          </span>
        </li>
      ))}
    </ul>
  )
}

const BODIES = { mcq: McqBody, fill_blank: FillBlankBody, match: MatchBody }

/**
 * Teacher review of a lesson's exercises, with the right answers shown.
 * Optional actions per exercise: « Modifier » (the card then shows `renderEditor(exercise)`)
 * and « Supprimer » (the parent offers an undo, so there is no confirmation here).
 * @param {{ exercises: object[], onRemove?: (id: string) => void, onEdit?: (id: string) => void,
 *   editingId?: string | null, renderEditor?: (exercise: object) => React.ReactNode, disabled?: boolean }} props
 */
export default function ExerciseReview({ exercises, onRemove, onEdit, editingId = null, renderEditor, disabled = false }) {
  const list = Array.isArray(exercises) ? exercises : []

  if (list.length === 0) {
    return (
      <EmptyNote
        icon={ListChecks}
        tone="purple"
        title="Aucun exercice"
        text="Cette leçon n'a pas d'exercices. Tu peux la régénérer pour en créer."
      />
    )
  }

  return (
    <ol className={styles.list}>
      {list.map((exercise, index) => {
        const Body = BODIES[exercise.type]
        const meta = TYPE_META[exercise.type]
        const editing = editingId === exercise.id && renderEditor
        const locked = disabled || Boolean(editingId)
        return (
          <li key={exercise.id} className={`${styles.item} ${editing ? styles.editing : ''}`}>
            <div className={styles.head}>
              <span className={styles.number} aria-hidden="true">{index + 1}</span>
              <span className="sr-only">Exercice {index + 1} : </span>
              <span className={`${styles.type} ${meta?.tone || styles.gray}`}>
                {meta && <Icon icon={meta.icon} size={14} />}
                {EXERCISE_TYPE_LABELS[exercise.type] || exercise.type}
              </span>
              {!editing && (onEdit || onRemove) && (
                <div className={styles.tools}>
                  {onEdit && (
                    <button
                      type="button"
                      className={`${ui.btn} ${ui.small} ${bits.blueGhost} ${bits.tap} ${styles.tool}`}
                      onClick={() => onEdit(exercise.id)}
                      disabled={locked}
                      data-exercise-edit={exercise.id}
                      aria-label={`Modifier l'exercice ${index + 1}`}
                    >
                      <Icon icon={Pencil} size={18} />
                      <span className={styles.toolLabel}>Modifier</span>
                    </button>
                  )}
                  {onRemove && (
                    <button
                      type="button"
                      className={`${ui.btn} ${ui.small} ${bits.redGhost} ${bits.tap} ${styles.tool}`}
                      onClick={() => onRemove(exercise.id)}
                      disabled={locked}
                      aria-label={`Supprimer l'exercice ${index + 1}`}
                    >
                      <Icon icon={Trash2} size={18} />
                      <span className={styles.toolLabel}>Supprimer</span>
                    </button>
                  )}
                </div>
              )}
            </div>
            {editing ? (
              renderEditor(exercise)
            ) : (
              <>
                {exercise.prompt && (
                  <p className={styles.prompt}>
                    <RichTextInline text={exercise.prompt} />
                  </p>
                )}
                {Body ? <Body exercise={exercise} /> : <p className={styles.hint}>Type d&apos;exercice inconnu.</p>}
                {exercise.explanation && (
                  <p className={styles.explanation}>
                    <Icon icon={Info} size={16} className={styles.inlineIcon} />
                    <RichTextInline text={exercise.explanation} />
                  </p>
                )}
              </>
            )}
          </li>
        )
      })}
    </ol>
  )
}
