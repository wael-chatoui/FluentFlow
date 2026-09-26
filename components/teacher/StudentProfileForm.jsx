import { useEffect, useId, useRef, useState } from 'react'
import { api } from '@/utils/apiClient'
import { LEVELS, safeDriveUrl } from '@/utils/lesson/schema'
import { LEVEL_LABELS, isAbortError } from '@/components/teacher/format'
import { useBeforeUnload, useMountedRef } from '@/components/teacher/hooks'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/teacher/StudentProfileForm.module.css'

const FIELDS = ['fullName', 'level', 'goals', 'interests', 'driveFolderUrl', 'notes']

function valuesFrom(student, notes) {
  return {
    fullName: student?.full_name || '',
    level: LEVELS.includes(student?.level) ? student.level : 'unknown',
    goals: student?.goals || '',
    interests: student?.interests || '',
    driveFolderUrl: student?.drive_folder_url || '',
    notes: typeof notes === 'string' ? notes : notes?.notes || '',
  }
}

export function driveUrlError(value) {
  const v = (value || '').trim()
  if (!v) return null
  return safeDriveUrl(v)
    ? null
    : 'Le lien doit commencer par https:// et pointer vers drive.google.com ou docs.google.com.'
}

/**
 * Editable "Fiche élève" with a single Save button, dirty tracking and inline Drive URL validation.
 * @param {{ studentId: string, student: object, notes: string | null, onSaved: (data: object) => void }} props
 */
export default function StudentProfileForm({ studentId, student, notes, onSaved }) {
  const mounted = useMountedRef()
  const uid = useId()
  const controllerRef = useRef(null)
  const savedTimer = useRef(null)
  const [initial, setInitial] = useState(() => valuesFrom(student, notes))
  const [values, setValues] = useState(initial)
  const [driveTouched, setDriveTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(
    () => () => {
      controllerRef.current?.abort()
      clearTimeout(savedTimer.current)
    },
    []
  )

  const changed = FIELDS.filter((key) => values[key] !== initial[key])
  const dirty = changed.length > 0
  const driveError = driveUrlError(values.driveFolderUrl)
  const showDriveError = Boolean(driveError) && driveTouched

  useBeforeUnload(dirty)

  const set = (key) => (e) => {
    const { value } = e.target
    setValues((v) => ({ ...v, [key]: value }))
    setJustSaved(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving || !dirty) return
    if (driveError) {
      setDriveTouched(true)
      document.getElementById(`${uid}-drive`)?.focus()
      return
    }

    const body = {}
    changed.forEach((key) => {
      body[key] = key === 'driveFolderUrl' ? safeDriveUrl(values[key].trim()) : values[key]
    })

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setSaving(true)
    setError(null)
    try {
      const data = await api(`/api/teacher/students/${studentId}`, {
        method: 'PATCH',
        body,
        signal: controller.signal,
      })
      if (!mounted.current) return
      const next = data?.student ? valuesFrom(data.student, data.notes) : { ...values }
      setInitial(next)
      setValues(next)
      setDriveTouched(false)
      setJustSaved(true)
      clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => {
        if (mounted.current) setJustSaved(false)
      }, 4000)
      if (data?.student) onSaved?.(data)
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      setError(err.message || "L'enregistrement a échoué.")
    } finally {
      if (mounted.current) setSaving(false)
    }
  }

  const handleReset = () => {
    setValues(initial)
    setDriveTouched(false)
    setError(null)
  }

  const id = (name) => `${uid}-${name}`

  return (
    <form className={styles.form} onSubmit={handleSubmit} noValidate>
      <fieldset className={styles.fieldset} disabled={saving}>
        <legend className="sr-only">Fiche élève</legend>
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor={id('name')} className={styles.label}>Nom</label>
            <input
              id={id('name')}
              className={styles.input}
              value={values.fullName}
              onChange={set('fullName')}
              placeholder="Prénom Nom"
              autoComplete="off"
              maxLength={120}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor={id('level')} className={styles.label}>Niveau</label>
            <select
              id={id('level')}
              className={`${styles.input} ${styles.select}`}
              value={values.level}
              onChange={set('level')}
            >
              {LEVELS.map((level) => (
                <option key={level} value={level}>
                  {LEVEL_LABELS[level] || level}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor={id('goals')} className={styles.label}>
            <span aria-hidden="true">🎯 </span>Objectifs
          </label>
          <textarea
            id={id('goals')}
            className={`${styles.input} ${styles.textarea}`}
            rows={3}
            value={values.goals}
            onChange={set('goals')}
            placeholder="Ex. : préparer un entretien d'embauche en français, voyager en France…"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor={id('interests')} className={styles.label}>
            <span aria-hidden="true">💡 </span>Centres d&apos;intérêt
          </label>
          <textarea
            id={id('interests')}
            className={`${styles.input} ${styles.textarea}`}
            rows={3}
            value={values.interests}
            onChange={set('interests')}
            placeholder="Ex. : cuisine, football, séries françaises…"
          />
        </div>

        <div className={styles.field}>
          <label htmlFor={id('drive')} className={styles.label}>
            <span aria-hidden="true">📁 </span>Lien du dossier Google Drive
          </label>
          <input
            id={id('drive')}
            type="url"
            inputMode="url"
            className={`${styles.input} ${showDriveError ? styles.invalid : ''}`}
            value={values.driveFolderUrl}
            onChange={set('driveFolderUrl')}
            onBlur={() => setDriveTouched(true)}
            placeholder="https://drive.google.com/drive/folders/…"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            aria-invalid={showDriveError || undefined}
            aria-describedby={showDriveError ? id('drive-error') : id('drive-hint')}
          />
          {showDriveError ? (
            <p id={id('drive-error')} className={styles.fieldError} role="alert">
              {driveError}
            </p>
          ) : (
            <p id={id('drive-hint')} className={styles.hint}>
              L&apos;élève verra ce lien sur sa page. Laisse vide pour le retirer.
            </p>
          )}
        </div>

        <div className={`${styles.field} ${styles.private}`}>
          <label htmlFor={id('notes')} className={styles.label}>
            <span aria-hidden="true">🔒 </span>Notes privées
          </label>
          <textarea
            id={id('notes')}
            className={`${styles.input} ${styles.textarea}`}
            rows={5}
            value={values.notes}
            onChange={set('notes')}
            aria-describedby={id('notes-hint')}
            placeholder="Points faibles, erreurs récurrentes, sujets à éviter…"
          />
          <p id={id('notes-hint')} className={styles.hint}>
            Visibles uniquement par toi — utilisées par l&apos;IA pour personnaliser les leçons.
          </p>
        </div>
      </fieldset>

      {error && (
        <div className={styles.alert} role="alert">
          <span aria-hidden="true">⚠️</span>
          <span>{error}</span>
        </div>
      )}

      <div className={`${styles.footer} ${dirty || saving ? styles.footerSticky : ''}`}>
        <div className={styles.status} role="status" aria-live="polite">
          {saving ? (
            'Enregistrement…'
          ) : justSaved && !dirty ? (
            <span className={styles.saved}>Enregistré ✓</span>
          ) : dirty ? (
            <span className={styles.dirty}>Modifications non enregistrées</span>
          ) : null}
        </div>
        <div className={styles.buttons}>
          {dirty && !saving && (
            <button type="button" className={`${ui.btn} ${ui.ghost} ${styles.cancel}`} onClick={handleReset}>
              Annuler
            </button>
          )}
          <button
            type="submit"
            className={`${ui.btn} ${ui.green} ${styles.save}`}
            disabled={!dirty || saving}
            aria-busy={saving || undefined}
          >
            {saving && <span className={styles.spinner} aria-hidden="true" />}
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </div>
    </form>
  )
}
