import { useEffect, useId, useRef, useState } from 'react'
import { safeDriveUrl } from '@/utils/lesson/schema'
import { useMountedRef } from '@/components/teacher/hooks'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/DriveLinkEditor.module.css'

/**
 * Inline editor for a lesson's Google Drive link.
 * @param {{ value: string, onSave: (url: string) => Promise<void>, disabled?: boolean }} props
 *   onSave receives a validated https Drive URL or '' (remove) and should throw on failure.
 */
export default function DriveLinkEditor({ value, onSave, disabled = false }) {
  const mounted = useMountedRef()
  const uid = useId()
  const inputRef = useRef(null)
  const editButtonRef = useRef(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value || '')
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [justSaved, setJustSaved] = useState(false)

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  useEffect(() => {
    if (!justSaved) return undefined
    const t = setTimeout(() => setJustSaved(false), 3000)
    return () => clearTimeout(t)
  }, [justSaved])

  const trimmed = draft.trim()
  const invalid = Boolean(trimmed) && !safeDriveUrl(trimmed)
  const showInvalid = invalid && touched

  const start = () => {
    setDraft(value || '')
    setTouched(false)
    setError(null)
    setEditing(true)
  }

  const cancel = () => {
    setEditing(false)
    setError(null)
    requestAnimationFrame(() => editButtonRef.current?.focus())
  }

  const submit = async (e) => {
    e.preventDefault()
    if (saving) return
    setTouched(true)
    if (invalid) {
      inputRef.current?.focus()
      return
    }
    const next = trimmed ? safeDriveUrl(trimmed) : ''
    if (next === (value || '')) {
      cancel()
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(next)
      if (!mounted.current) return
      setEditing(false)
      setJustSaved(true)
      requestAnimationFrame(() => editButtonRef.current?.focus())
    } catch (err) {
      if (err?.name === 'AbortError' || !mounted.current) return
      setError(err?.message || "Le lien n'a pas pu être enregistré.")
    } finally {
      if (mounted.current) setSaving(false)
    }
  }

  if (!editing) {
    const href = safeDriveUrl(value)
    return (
      <div className={styles.view}>
        <span className={styles.icon} aria-hidden="true">📁</span>
        <span className={styles.text}>
          <span className={styles.label}>Document Drive</span>
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer" className={styles.link}>
              Ouvrir le document<span className="sr-only"> (nouvel onglet)</span> <span aria-hidden="true">↗</span>
            </a>
          ) : (
            <span className={styles.none}>Aucun lien</span>
          )}
        </span>
        <span className={styles.saved} role="status" aria-live="polite">
          {justSaved ? 'Enregistré ✓' : ''}
        </span>
        <button
          ref={editButtonRef}
          type="button"
          className={`${ui.btn} ${ui.small} ${ui.ghost} ${bits.tap} ${styles.edit}`}
          onClick={start}
          disabled={disabled}
        >
          {value ? 'Modifier' : 'Ajouter'}
          <span className="sr-only"> le lien Drive</span>
        </button>
      </div>
    )
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <label htmlFor={`${uid}-drive`} className={bits.label}>
        <span aria-hidden="true">📁 </span>Lien du document Google Drive
      </label>
      <div className={styles.inputRow}>
        <input
          ref={inputRef}
          id={`${uid}-drive`}
          type="url"
          inputMode="url"
          className={`${bits.input} ${styles.input} ${showInvalid ? bits.invalid : ''}`}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value)
            setError(null)
          }}
          onBlur={() => setTouched(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault()
              cancel()
            }
          }}
          placeholder="https://docs.google.com/…"
          autoComplete="off"
          spellCheck={false}
          disabled={saving}
          aria-invalid={showInvalid || undefined}
          aria-describedby={`${uid}-drive-help`}
        />
        <div className={styles.buttons}>
          <button
            type="submit"
            className={`${ui.btn} ${ui.small} ${ui.green} ${bits.tap}`}
            disabled={saving || showInvalid}
          >
            {saving && <span className={bits.spinner} aria-hidden="true" />}
            {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
          <button type="button" className={`${ui.btn} ${ui.small} ${bits.tap}`} onClick={cancel} disabled={saving}>
            Annuler
          </button>
        </div>
      </div>
      <p
        id={`${uid}-drive-help`}
        className={showInvalid || error ? styles.error : styles.help}
        role={showInvalid || error ? 'alert' : undefined}
      >
        {error ||
          (showInvalid
            ? 'Le lien doit commencer par https:// et pointer vers drive.google.com ou docs.google.com.'
            : 'Laisse vide pour retirer le lien.')}
      </p>
    </form>
  )
}
