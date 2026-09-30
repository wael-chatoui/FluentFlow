import { useEffect, useId, useRef, useState } from 'react'
import SourceField from '@/components/teacher/lessons/SourceInput'
import OptionsDisclosure, {
  hasOptionErrors,
  optionsChanged,
  optionsFromStored,
  optionsToSend,
} from '@/components/teacher/lessons/OptionsDisclosure'
import { SOURCE_LIMITS, formatCount, sourcesError } from '@/components/teacher/format'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/lessons/RegeneratePanel.module.css'

/**
 * « Modifier les sources et régénérer »: the stored transcript / Canva notes (or, for an
 * imported lesson, the document summary) and the exercise options, editable before
 * relaunching the AI. Only what changed is sent to POST /regenerate.
 * @param {{ lesson: object, busy?: boolean, error?: string | null,
 *   onSubmit: (body: object) => void, onCancel: () => void }} props
 */
export default function RegeneratePanel({ lesson, busy = false, error, onSubmit, onCancel }) {
  const uid = useId()
  const headingRef = useRef(null)
  const imported = lesson.source_kind === 'import'
  // A transcript lesson made without options was left to the AI: it can stay so (an
  // import always has fixed options, and stored options cannot be cleared)
  const [initialOptions] = useState(() => optionsFromStored(lesson.generation_options, { auto: !imported }))
  const [options, setOptions] = useState(initialOptions)
  const [transcript, setTranscript] = useState(lesson.transcript || '')
  const [canva, setCanva] = useState(lesson.canva || '')
  const [attempted, setAttempted] = useState(false)

  // Bring the editor into view and move focus to it when it opens
  useEffect(() => {
    headingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    headingRef.current?.focus({ preventScroll: true })
  }, [])

  const hasContent = Boolean(lesson.content)
  // Unchanged stored texts are not length-checked (same rule as the API)
  const stored = [
    transcript === (lesson.transcript || '') && 'transcript',
    canva === (lesson.canva || '') && 'canva',
  ].filter(Boolean)
  const sourceError = imported ? null : sourcesError(transcript, canva, { stored })
  const errorId = `${uid}-error`

  const submit = (e) => {
    e.preventDefault()
    if (busy) return
    setAttempted(true)
    if (sourceError || hasOptionErrors(options)) return
    const body = {}
    if (!imported && transcript !== (lesson.transcript || '')) body.transcript = transcript
    if (!imported && canva !== (lesson.canva || '')) body.canva = canva
    if (optionsChanged(options, initialOptions)) body.options = optionsToSend(options)
    onSubmit(body)
  }

  return (
    <section className={styles.panel} aria-labelledby={`${uid}-title`}>
      <h2 id={`${uid}-title`} ref={headingRef} tabIndex={-1} className={styles.title}>
        <span aria-hidden="true">🔄 </span>
        {imported ? 'Régénérer la leçon' : 'Modifier les sources et régénérer'}
      </h2>
      <p className={styles.intro}>
        {hasContent
          ? "Le bilan et les exercices actuels seront remplacés et les résultats de l'élève sur cette leçon repartiront à zéro. En attendant, l'élève garde la version actuelle."
          : 'Corrige ou raccourcis les sources si besoin, puis relance la génération.'}
      </p>

      <form className={styles.form} onSubmit={submit} noValidate>
        <fieldset className={styles.fieldset} disabled={busy}>
          <legend className="sr-only">Sources et options</legend>
          {imported ? (
            <p className={styles.document}>
              <span aria-hidden="true">📄 </span>
              <strong>{lesson.source_name || 'Document importé'}</strong>
              {lesson.source_text ? ` — ${formatCount(lesson.source_text.length)} caractères` : ''}
              <span className={styles.documentNote}>
                Le texte importé est réutilisé tel quel. Pour un autre document, lance un nouvel import.
              </span>
            </p>
          ) : (
            <>
              <SourceField
                label="Transcription"
                icon="🎙️"
                value={transcript}
                max={SOURCE_LIMITS.transcript}
                onChange={setTranscript}
                rows={10}
                invalid={attempted && Boolean(sourceError)}
                describedBy={attempted && sourceError ? errorId : undefined}
              />
              <SourceField
                label="Notes Canva"
                icon="🎨"
                value={canva}
                max={SOURCE_LIMITS.canva}
                onChange={setCanva}
                rows={6}
                invalid={attempted && Boolean(sourceError)}
                describedBy={attempted && sourceError ? errorId : undefined}
              />
              {attempted && sourceError && (
                <p id={errorId} className={bits.fieldError} role="alert">
                  <span aria-hidden="true">⚠️</span> {sourceError}
                </p>
              )}
            </>
          )}
          <OptionsDisclosure
            value={options}
            onChange={setOptions}
            disabled={busy}
            defaultOpen={imported}
            allowAuto={initialOptions.auto}
            hint="Ces réglages remplacent ceux de la dernière génération."
          />
        </fieldset>

        {error && (
          <div className={`${bits.alert} ${bits.error}`} role="alert">
            <span className={bits.alertIcon} aria-hidden="true">⚠️</span>
            <span className={bits.alertBody}>{error}</span>
          </div>
        )}

        <div className={styles.actions}>
          <button type="button" className={`${ui.btn} ${styles.action}`} onClick={onCancel} disabled={busy}>
            Annuler
          </button>
          <button type="submit" className={`${ui.btn} ${ui.blue} ${styles.action}`} disabled={busy} aria-busy={busy || undefined}>
            {busy ? <span className={bits.spinner} aria-hidden="true" /> : <span aria-hidden="true">🔄</span>}
            {busy ? 'Lancement…' : 'Régénérer'}
          </button>
        </div>
      </form>
    </section>
  )
}
