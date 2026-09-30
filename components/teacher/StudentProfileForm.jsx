import { useEffect, useId, useRef, useState } from 'react'
import { api } from '@/utils/apiClient'
import { LEVELS, safeDriveUrl } from '@/utils/lesson/schema'
import useUnsavedGuard from '@/components/ui/useUnsavedGuard'
import { LEVEL_LABELS, formatCount, isAbortError } from '@/components/teacher/format'
import { useMountedRef } from '@/components/teacher/hooks'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/teacher/StudentProfileForm.module.css'

const FIELDS = ['fullName', 'level', 'goals', 'interests', 'driveFolderUrl', 'aiContext', 'notes']
// Same limits as the API (utils/api/validate.js LIMITS.notes, aiContext, profileText)
const MAX_NOTES = 10_000
const MAX_AI_CONTEXT = 4000
const MAX_PROFILE_TEXT = 1000
const LIMITS = { goals: MAX_PROFILE_TEXT, interests: MAX_PROFILE_TEXT, aiContext: MAX_AI_CONTEXT, notes: MAX_NOTES }

/** Fields longer than the API accepts (the save would be refused as a whole). */
export function overLimitFields(values) {
  return Object.keys(LIMITS).filter((key) => (values[key] || '').length > LIMITS[key])
}

function valuesFrom(student, notes, aiContext) {
  return {
    fullName: student?.full_name || '',
    level: LEVELS.includes(student?.level) ? student.level : 'unknown',
    goals: student?.goals || '',
    interests: student?.interests || '',
    driveFolderUrl: student?.drive_folder_url || '',
    aiContext: typeof aiContext === 'string' ? aiContext : '',
    notes: typeof notes === 'string' ? notes : notes?.notes || '',
  }
}

function LengthCounter({ id, value, max }) {
  return (
    <span id={id} className={`${styles.counter} ${value.length > max ? styles.counterOver : ''}`}>
      {formatCount(value.length)} / {formatCount(max)}
    </span>
  )
}

export function driveUrlError(value) {
  const v = (value || '').trim()
  if (!v) return null
  return safeDriveUrl(v)
    ? null
    : 'Le lien doit commencer par https:// et pointer vers drive.google.com ou docs.google.com.'
}

/**
 * Editable "Fiche élève" with a single Save button, dirty tracking (in-app navigation and
 * tab close are guarded) and inline Drive URL validation. The private notes are never sent
 * to the AI; « Contexte pour l'IA » is.
 * @param {{ studentId: string, student: object, notes: string | null, aiContext: string | null,
 *   onSaved: (data: object) => void }} props
 */
export default function StudentProfileForm({ studentId, student, notes, aiContext, onSaved }) {
  const mounted = useMountedRef()
  const uid = useId()
  const controllerRef = useRef(null)
  const savedTimer = useRef(null)
  const [initial, setInitial] = useState(() => valuesFrom(student, notes, aiContext))
  const [values, setValues] = useState(initial)
  const [driveTouched, setDriveTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [justSaved, setJustSaved] = useState(false)
  // The private notes were copied into « Contexte pour l'IA »: ask to review them before saving
  const [reusedNotes, setReusedNotes] = useState(false)

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
  const over = overLimitFields(values)
  const tooLong = over.length > 0

  useUnsavedGuard(dirty, 'La fiche élève a des modifications non enregistrées. Quitter quand même ?')

  const set = (key) => (e) => {
    const { value } = e.target
    setValues((v) => ({ ...v, [key]: value }))
    setJustSaved(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving || !dirty || tooLong) return
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
      const next = data?.student ? valuesFrom(data.student, data.notes, data.ai_context) : { ...values }
      setInitial(next)
      setValues(next)
      setDriveTouched(false)
      setReusedNotes(false)
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
    setReusedNotes(false)
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
          <div className={styles.labelRow}>
            <label htmlFor={id('goals')} className={styles.label}>
              <span aria-hidden="true">🎯 </span>Objectifs
            </label>
            <LengthCounter id={id('goals-count')} value={values.goals} max={MAX_PROFILE_TEXT} />
          </div>
          <textarea
            id={id('goals')}
            className={`${styles.input} ${styles.textarea} ${over.includes('goals') ? styles.invalid : ''}`}
            rows={3}
            value={values.goals}
            onChange={set('goals')}
            aria-describedby={id('goals-count')}
            aria-invalid={over.includes('goals') || undefined}
            placeholder="Ex. : préparer un entretien d'embauche en français, voyager en France…"
          />
        </div>

        <div className={styles.field}>
          <div className={styles.labelRow}>
            <label htmlFor={id('interests')} className={styles.label}>
              <span aria-hidden="true">💡 </span>Centres d&apos;intérêt
            </label>
            <LengthCounter id={id('interests-count')} value={values.interests} max={MAX_PROFILE_TEXT} />
          </div>
          <textarea
            id={id('interests')}
            className={`${styles.input} ${styles.textarea} ${over.includes('interests') ? styles.invalid : ''}`}
            rows={3}
            value={values.interests}
            onChange={set('interests')}
            aria-describedby={id('interests-count')}
            aria-invalid={over.includes('interests') || undefined}
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

        <div className={`${styles.field} ${styles.aiContext}`}>
          <div className={styles.labelRow}>
            <label htmlFor={id('ai')} className={styles.label}>
              <span aria-hidden="true">🤖 </span>Contexte pour l&apos;IA
            </label>
            <LengthCounter id={id('ai-count')} value={values.aiContext} max={MAX_AI_CONTEXT} />
          </div>
          <textarea
            id={id('ai')}
            className={`${styles.input} ${styles.textarea} ${over.includes('aiContext') ? styles.invalid : ''}`}
            rows={6}
            value={values.aiContext}
            onChange={set('aiContext')}
            aria-describedby={`${id('ai-hint')} ${id('ai-count')}`}
            aria-invalid={over.includes('aiContext') || undefined}
            placeholder="Ex. : ingénieure, prépare un entretien en français en mars. Adore la cuisine. Éviter la politique. Veut des devoirs courts le week-end."
          />
          <p id={id('ai-hint')} className={styles.hint}>
            Envoyé à l&apos;IA pour personnaliser les leçons et les plans de cours : métier, objectifs précis, sujets
            à éviter, points à travailler, préférences de devoirs… Tu peux y coller l&apos;ancienne fiche{' '}
            <code>students/…md</code> de l&apos;élève. N&apos;y mets rien que l&apos;élève ne doive pas lire dans ses
            leçons.
          </p>
          {!values.aiContext.trim() && values.notes.trim() && (
            <button
              type="button"
              className={`${ui.btn} ${ui.small} ${styles.reuse}`}
              onClick={() => {
                setValues((v) => ({ ...v, aiContext: v.notes.slice(0, MAX_AI_CONTEXT) }))
                setReusedNotes(true)
                document.getElementById(id('ai'))?.focus()
              }}
            >
              <span aria-hidden="true">📋</span> Reprendre mes notes privées ici
            </button>
          )}
          {reusedNotes && dirty && values.aiContext.trim() && (
            <p className={styles.fieldError} role="status">
              <span aria-hidden="true">⚠️ </span>
              Relis ce texte et retire ce qui doit rester privé (paiements, remarques personnelles…) avant
              d&apos;enregistrer : il sera envoyé à l&apos;IA.
            </p>
          )}
        </div>

        <div className={`${styles.field} ${styles.private}`}>
          <div className={styles.labelRow}>
            <label htmlFor={id('notes')} className={styles.label}>
              <span aria-hidden="true">🔒 </span>Notes privées (jamais envoyées à l&apos;IA)
            </label>
            <LengthCounter id={id('notes-count')} value={values.notes} max={MAX_NOTES} />
          </div>
          <textarea
            id={id('notes')}
            className={`${styles.input} ${styles.textarea} ${over.includes('notes') ? styles.invalid : ''}`}
            rows={5}
            value={values.notes}
            onChange={set('notes')}
            aria-describedby={`${id('notes-hint')} ${id('notes-count')}`}
            aria-invalid={over.includes('notes') || undefined}
            placeholder="Paiements, disponibilités, remarques personnelles…"
          />
          <p id={id('notes-hint')} className={styles.hint}>
            Visibles uniquement par toi. Elles ne sont jamais envoyées à l&apos;IA ni montrées à l&apos;élève.
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
          ) : tooLong ? (
            <span className={styles.dirty}>Texte trop long : raccourcis-le pour enregistrer</span>
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
            disabled={!dirty || saving || tooLong}
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
