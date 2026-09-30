import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { api } from '@/utils/apiClient'
import { LEVELS } from '@/utils/lesson/schema'
import useUnsavedGuard from '@/components/ui/useUnsavedGuard'
import { LEVEL_OPTIONS } from '@/components/student/profile/levels'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/student/profile/Profile.module.css'

const MAX_NAME = 120
const MAX_TEXT = 1000
const LEAVE_MESSAGE = 'You have unsaved changes. Leave this page anyway?'

function toForm(profile) {
  return {
    fullName: profile?.full_name || '',
    level: LEVELS.includes(profile?.level) ? profile.level : '',
    goals: profile?.goals || '',
    interests: profile?.interests || '',
  }
}

/**
 * Editable profile (name, level, goals, interests) → PATCH /api/student/profile.
 * Only changed fields are sent; the Save button is enabled only when something changed.
 * Leaving the page (tab, link, reload) with unsaved changes asks first, unless `guard`
 * is false (the page is signing out or deleting the account).
 * @param {{ profile: object, onSaved: (profile: object) => void, guard?: boolean }} props
 */
export default function ProfileForm({ profile, onSaved, guard = true }) {
  const uid = useId()
  const [saved, setSaved] = useState(() => toForm(profile))
  const [values, setValues] = useState(() => toForm(profile))
  const [status, setStatus] = useState({ kind: 'idle', message: '' }) // idle | saving | saved | error
  const savingRef = useRef(false)
  const controllerRef = useRef(null)
  const onSavedRef = useRef(onSaved)
  onSavedRef.current = onSaved

  // Abort an in-flight save on unmount (no setState afterwards)
  useEffect(() => () => controllerRef.current?.abort(), [])

  const changes = useMemo(() => {
    const out = {}
    if (values.fullName.trim() !== saved.fullName.trim()) out.fullName = values.fullName.trim()
    if (values.level && values.level !== saved.level) out.level = values.level
    if (values.goals.trim() !== saved.goals.trim()) out.goals = values.goals.trim()
    if (values.interests.trim() !== saved.interests.trim()) out.interests = values.interests.trim()
    return out
  }, [values, saved])

  const dirty = Object.keys(changes).length > 0
  const saving = status.kind === 'saving'
  const nameMissing = !values.fullName.trim()
  const canSave = dirty && !nameMissing && !saving

  useUnsavedGuard(dirty && guard, LEAVE_MESSAGE)

  // The page first renders the cached profile, then refreshes it in the background:
  // show the fresher values, unless the student has started editing (never overwrite input)
  const incoming = JSON.stringify(toForm(profile))
  const busyRef = useRef(false)
  busyRef.current = dirty || saving
  useEffect(() => {
    if (busyRef.current) return
    const next = JSON.parse(incoming)
    setSaved(next)
    setValues(next)
  }, [incoming])

  const update = (field) => (e) => {
    const { value } = e.target
    setValues((v) => ({ ...v, [field]: value }))
    setStatus((s) => (s.kind === 'saving' ? s : { kind: 'idle', message: '' }))
  }

  const handleReset = () => {
    setValues(saved)
    setStatus({ kind: 'idle', message: '' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!canSave || savingRef.current) return
    savingRef.current = true
    setStatus({ kind: 'saving', message: '' })

    const controller = new AbortController()
    controllerRef.current = controller
    try {
      const data = await api('/api/student/profile', { method: 'PATCH', body: changes, signal: controller.signal })
      if (controller.signal.aborted) return
      const next = data?.profile ? toForm(data.profile) : { ...values, ...changes }
      setSaved(next)
      setValues(next)
      setStatus({ kind: 'saved', message: '' })
      if (data?.profile) onSavedRef.current?.(data.profile)
    } catch (err) {
      if (err?.name === 'AbortError' || controller.signal.aborted) return
      setStatus({ kind: 'error', message: err?.message || 'Could not save your changes. Please try again.' })
    } finally {
      if (!controller.signal.aborted) savingRef.current = false
    }
  }

  return (
    <form className={`${ui.card} ${styles.formCard}`} onSubmit={handleSubmit} noValidate aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} className={styles.cardTitle}>
        <span className={`${styles.cardIcon} ${styles.iconBlue}`} aria-hidden="true">
          ✏️
        </span>
        About you
      </h2>
      <p className={styles.cardHelp}>Wael uses this to make your lessons fit you.</p>

      <fieldset className={styles.fields} disabled={saving}>
        <div className={styles.field}>
          <label htmlFor={`${uid}-name`} className={styles.label}>
            Your name
          </label>
          <input
            id={`${uid}-name`}
            className={styles.input}
            value={values.fullName}
            onChange={update('fullName')}
            autoComplete="name"
            maxLength={MAX_NAME}
            required
            aria-invalid={nameMissing || undefined}
            aria-describedby={nameMissing ? `${uid}-name-err` : undefined}
          />
          {nameMissing && (
            <p id={`${uid}-name-err`} className={styles.fieldError}>
              Please enter your name.
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor={`${uid}-level`} className={styles.label}>
            Your French level
          </label>
          <div className={styles.selectWrap}>
            <select id={`${uid}-level`} className={styles.select} value={values.level} onChange={update('level')}>
              {!values.level && (
                <option value="" disabled>
                  Choose your level
                </option>
              )}
              {LEVEL_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor={`${uid}-goals`} className={styles.label}>
            Your goals <span className={styles.optional}>(optional)</span>
          </label>
          <textarea
            id={`${uid}-goals`}
            className={`${styles.input} ${styles.textarea}`}
            value={values.goals}
            onChange={update('goals')}
            placeholder="Travel, work, exams, family, moving to France…"
            rows={3}
            maxLength={MAX_TEXT}
          />
        </div>

        <div className={styles.field}>
          <label htmlFor={`${uid}-interests`} className={styles.label}>
            Your interests <span className={styles.optional}>(optional)</span>
          </label>
          <textarea
            id={`${uid}-interests`}
            className={`${styles.input} ${styles.textarea}`}
            value={values.interests}
            onChange={update('interests')}
            placeholder="Cooking, soccer, movies, history…"
            rows={2}
            maxLength={MAX_TEXT}
          />
        </div>
      </fieldset>

      {status.kind === 'error' && (
        <p className={styles.formError} role="alert">
          {status.message}
        </p>
      )}

      <div className={styles.formActions}>
        <button type="submit" className={`${ui.btn} ${ui.green} ${styles.saveBtn}`} disabled={!canSave}>
          {saving ? 'Saving…' : 'Save changes'}
        </button>
        {dirty && !saving && (
          <button type="button" className={`${ui.btn} ${ui.ghost} ${styles.resetBtn}`} onClick={handleReset}>
            Undo changes
          </button>
        )}
        <p className={styles.saveStatus} role="status" aria-live="polite">
          {status.kind === 'saved' && !dirty ? (
            <span className={styles.savedMsg}>Saved ✓</span>
          ) : dirty && !saving ? (
            <span className={styles.unsavedMsg}>Unsaved changes</span>
          ) : (
            ''
          )}
        </p>
      </div>
    </form>
  )
}
