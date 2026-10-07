import { useState } from 'react'
import { api } from '@/utils/apiClient'
import ConfirmDialog from '@/components/teacher/ConfirmDialog'
import ExerciseReview from '@/components/teacher/ExerciseReview'
import ExerciseEditor from '@/components/teacher/lessons/ExerciseEditor'
import { isAbortError, plural } from '@/components/teacher/format'
import { useMountedRef } from '@/components/teacher/hooks'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/LessonPage.module.css'
import { CircleAlert, CircleCheck, Hourglass, Pencil, RefreshCw } from 'lucide-react'
import Icon from '@/components/ui/Icon'

function focusEditButton(id) {
  requestAnimationFrame(() => document.querySelector(`[data-exercise-edit="${id}"]`)?.focus())
}

function saveErrorMessage(err) {
  if (err?.code === 'conflict') {
    return 'La leçon a été modifiée ailleurs entre-temps (autre onglet, back-office…). Recharge-la pour repartir de la dernière version.'
  }
  if (err?.code === 'generating') return "Une génération est en cours : attends qu'elle se termine pour modifier les exercices."
  return err?.message || "L'exercice n'a pas pu être enregistré."
}

/**
 * « Exercices » tab: answers highlighted, remove (with undo, handled by the page) and
 * inline edit of one exercise. Saving sends the whole list with `expectedUpdatedAt`
 * (409 when the lesson changed elsewhere) and restarts the student's results on it.
 * @param {{ lesson: object, exercises: object[], disabled: boolean, resultsCount: number,
 *   error?: string | null, onRemove: (id: string) => void, onEditStart: () => void,
 *   onSaved: (lesson: object) => void, onReload: () => void }} props
 *   `exercises`: what is shown (without the removals waiting for their undo delay);
 *   `resultsCount`: practice sessions on the current version.
 */
export default function ExercisesPanel({ lesson, exercises, disabled, resultsCount, error, onRemove, onEditStart, onSaved, onReload }) {
  const mounted = useMountedRef()
  const [editingId, setEditingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState(null)
  const [conflict, setConflict] = useState(false)
  const [toConfirm, setToConfirm] = useState(null)

  const close = () => {
    const id = editingId
    setEditingId(null)
    setSaveError(null)
    setConflict(false)
    if (id) focusEditButton(id)
  }

  const startEdit = (id) => {
    onEditStart()
    setEditingId(id)
    setSaveError(null)
    setConflict(false)
  }

  const send = async (edited) => {
    setToConfirm(null)
    setSaving(true)
    setSaveError(null)
    try {
      const res = await api(`/api/teacher/lessons/${lesson.id}`, {
        method: 'PATCH',
        body: {
          exercises: exercises.map((e) => (e.id === edited.id ? edited : e)),
          expectedUpdatedAt: lesson.updated_at,
        },
      })
      if (!mounted.current) return
      setSaving(false)
      if (res?.lesson) onSaved(res.lesson)
      close()
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      setSaving(false)
      setConflict(err?.code === 'conflict')
      setSaveError(saveErrorMessage(err))
    }
  }

  const sendList = async (newList) => {
    setSaving(true)
    setSaveError(null)
    try {
      const res = await api(`/api/teacher/lessons/${lesson.id}`, {
        method: 'PATCH',
        body: {
          exercises: newList,
          expectedUpdatedAt: lesson.updated_at,
        },
      })
      if (!mounted.current) return
      setSaving(false)
      if (res?.lesson) onSaved(res.lesson)
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      setSaving(false)
      setConflict(err?.code === 'conflict')
      setSaveError(saveErrorMessage(err))
    }
  }

  const reactivate = (id) => {
    const updated = exercises.map((e) => {
      if (e.id === id) {
        const { disabled: _dis, reported: _rep, ...rest } = e
        return rest
      }
      return e
    })
    sendList(updated)
  }

  // The removed card disappears: keep the keyboard focus on a neighbour
  const remove = (id) => {
    const index = exercises.findIndex((e) => e.id === id)
    const neighbour = exercises[index + 1] || exercises[index - 1]
    onRemove(id)
    if (neighbour) focusEditButton(neighbour.id)
  }

  const save = (edited) => {
    // Editing an exercise clears any deactivated/reported state
    const { disabled: _d, reported: _r, ...cleaned } = edited
    if (resultsCount > 0) setToConfirm(cleaned)
    else send(cleaned)
  }

  return (
    <>
      {error && (
        <div className={`${bits.alert} ${bits.error}`} role="alert">
          <span className={bits.alertIcon} aria-hidden="true">
            <Icon icon={CircleAlert} size={20} />
          </span>
          <span className={bits.alertBody}>{error}</span>
        </div>
      )}
      <p className={styles.panelIntro}>
        <Icon icon={CircleCheck} size={16} className={styles.inlineIcon} />{' '}
        Les bonnes réponses sont en vert. Corrige un exercice avec « Modifier », ou retire-le avec « Supprimer » (tu
        pourras annuler pendant quelques secondes).
      </p>
      {disabled && (
        <p className={`${bits.alert} ${bits.info}`}>
          <span className={bits.alertIcon} aria-hidden="true">
            <Icon icon={Hourglass} size={20} />
          </span>
          <span className={bits.alertBody}>Modification impossible pendant une génération.</span>
        </p>
      )}
      <ExerciseReview
        exercises={exercises}
        onRemove={remove}
        onEdit={startEdit}
        onReactivate={reactivate}
        editingId={editingId}
        disabled={disabled || saving}
        renderEditor={(exercise) => (
          <>
            <ExerciseEditor
              exercise={exercise}
              saving={saving}
              error={saveError}
              resetsResults={resultsCount > 0}
              onSave={save}
              onCancel={close}
            />
            {conflict && (
              <button type="button" className={`${ui.btn} ${ui.small} ${ui.blue} ${bits.tap}`} onClick={onReload}>
                <Icon icon={RefreshCw} size={16} /> Recharger la leçon
              </button>
            )}
          </>
        )}
      />
      <ConfirmDialog
        open={Boolean(toConfirm)}
        title="Enregistrer la modification ?"
        message={`L'élève a déjà ${plural(resultsCount, 'essai')} sur cette leçon : ses résultats (meilleur score, erreurs) repartent à zéro et il devra refaire les exercices.`}
        confirmLabel="Enregistrer"
        icon={Pencil}
        onConfirm={() => send(toConfirm)}
        onCancel={() => setToConfirm(null)}
      />
    </>
  )
}
