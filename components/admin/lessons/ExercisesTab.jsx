import { cx } from '@/components/admin/common/format'
import { RowControls, TextField } from '@/components/admin/lessons/fields'
import { FillBlankEditor, MatchEditor, McqEditor } from '@/components/admin/lessons/ExerciseEditors'
import { EMPTY, LIMITS, move, removeAt, replaceAt } from '@/components/admin/lessons/editorModel'
import { EXERCISE_TYPE_META } from '@/components/admin/lessons/constants'
import { EXERCISE_TYPES } from '@/utils/lesson/schema'
import admin from '@/components/admin/common/admin.module.css'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/admin/lessons/editor.module.css'
import { CircleHelp, ListChecks, Plus, TriangleAlert } from 'lucide-react'
import Icon from '@/components/ui/Icon'

const EDITORS = { mcq: McqEditor, fill_blank: FillBlankEditor, match: MatchEditor }
const PILL_TONES = { blue: admin.pillBlue, orange: admin.pillOrange, purple: admin.pillPurple }
const DEFAULT_PROMPTS = {
  mcq: 'Choose the right answer',
  fill_blank: 'Fill in the blank',
  match: 'Match the pairs',
}

/**
 * "Exercices" tab: one editable card per exercise, add / delete / reorder.
 * @param {{ exercises: object[], onChange: (list: object[]) => void, errors: Record<string, string>,
 *   resetsProgress?: boolean }} props  resetsProgress: saving would restart the student's progress
 */
export default function ExercisesTab({ exercises, onChange, errors, resetsProgress }) {
  const full = exercises.length >= LIMITS.exercises

  const addButtons = (
    <div className={styles.addRow}>
      {EXERCISE_TYPES.map((type) => {
        const meta = EXERCISE_TYPE_META[type]
        return (
          <button
            key={type}
            type="button"
            className={cx(ui.btn, ui.small, admin.tap, admin.blueGhost)}
            disabled={full}
            onClick={() => onChange([...exercises, EMPTY[type]()])}
          >
            <Icon icon={Plus} size={16} strokeWidth={3} /> {meta.label}
          </button>
        )
      })}
      <span className={admin.hint}>
        {exercises.length}/{LIMITS.exercises} exercices
      </span>
    </div>
  )

  return (
    <div className={admin.stack}>
      {errors.exercises && (
        <div className={admin.alert} role="alert">
          <span className={admin.alertText}>{errors.exercises}</span>
        </div>
      )}

      {resetsProgress && (
        <div className={cx(admin.alert, admin.alertWarn)} role="status">
          <Icon icon={TriangleAlert} size={20} />
          <span className={admin.alertText}>
            Exercices ajoutés ou modifiés : à l’enregistrement, la progression de l’élève sur cette leçon repart de zéro
            (meilleur score, tentatives, erreurs à revoir), car ses anciens résultats ne correspondent plus. Supprimer ou
            réordonner des exercices ne la réinitialise pas.
          </span>
        </div>
      )}

      {exercises.length === 0 ? (
        <div className={cx(admin.section, admin.empty)}>
          <span className={admin.stateIcon} aria-hidden="true">
            <Icon icon={ListChecks} size={28} />
          </span>
          Aucun exercice. Ajoute-en un ci-dessous.
        </div>
      ) : (
        <ol className={styles.exerciseList}>
          {exercises.map((exercise, i) => {
            const meta = EXERCISE_TYPE_META[exercise.type] || { label: exercise.type, icon: CircleHelp, tone: 'gray' }
            const Editor = EDITORS[exercise.type]
            const update = (patch) => onChange(replaceAt(exercises, i, { ...exercise, ...patch }))
            const hasError = Object.keys(errors).some((k) => k.startsWith(`exercises.${i}.`))
            return (
              <li key={exercise._k || exercise.id || i} className={cx(admin.section, styles.exerciseCard, hasError && styles.cardInvalid)}>
                <div className={styles.exerciseHead}>
                  <span className={styles.exerciseNumber} aria-hidden="true">
                    {i + 1}
                  </span>
                  <h3 className={styles.exerciseTitle}>
                    <span className="sr-only">Exercice {i + 1} : </span>
                    <span className={cx(admin.pill, PILL_TONES[meta.tone] || admin.pillGray)}>
                      <Icon icon={meta.icon} size={14} /> {meta.label}
                    </span>
                  </h3>
                  <span className={cx(admin.mono, admin.muted)} title="Identifiant (lecture seule)">
                    {exercise.id || 'nouveau'}
                  </span>
                  <RowControls
                    index={i}
                    count={exercises.length}
                    label={`l'exercice ${i + 1}`}
                    onMove={(to) => onChange(move(exercises, i, to))}
                    onRemove={() => onChange(removeAt(exercises, i))}
                  />
                </div>
                <div className={styles.fields}>
                  <TextField
                    label="Consigne"
                    value={exercise.prompt}
                    maxLength={200}
                    lang="en"
                    placeholder={DEFAULT_PROMPTS[exercise.type]}
                    hint="Vide = consigne par défaut."
                    onChange={(prompt) => update({ prompt })}
                  />
                  {Editor ? (
                    <Editor exercise={exercise} index={i} update={update} errors={errors} />
                  ) : (
                    <p className={admin.fieldError}>{errors[`exercises.${i}.type`] || "Type d'exercice inconnu."}</p>
                  )}
                  <TextField
                    label="Explication (optionnelle)"
                    value={exercise.explanation}
                    maxLength={500}
                    hint="Affichée après la réponse. **mot** pour surligner."
                    onChange={(explanation) => update({ explanation })}
                  />
                </div>
              </li>
            )
          })}
        </ol>
      )}

      {addButtons}
    </div>
  )
}
