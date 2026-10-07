import { forwardRef, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import DriveLinkEditor from '@/components/teacher/DriveLinkEditor'
import StatusBadge from '@/components/teacher/StatusBadge'
import { CopyButton } from '@/components/teacher/CopyField'
import { lessonIcon } from '@/components/student/lessons/progress'
import { accentStyle } from '@/components/ui/accents'
import { formatLessonDate, isAbortError, lessonTitle, parseLocalDate, plural } from '@/components/teacher/format'
import { useMountedRef } from '@/components/teacher/hooks'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/LessonPage.module.css'
import { CircleAlert, Eye, EyeOff, FileText, ListChecks, Mail, Pencil, Play, RefreshCw, Send, Trash2, User } from 'lucide-react'
import Icon from '@/components/ui/Icon'

const TITLE_MAX = 120

/** Inline form for the title + date (PATCH). Escape cancels. */
function MetaEditor({ lesson, onSave, onDone }) {
  const uid = useId()
  const mounted = useMountedRef()
  const [title, setTitle] = useState(lessonTitle(lesson))
  const [date, setDate] = useState(lesson.lesson_date || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const submit = async (e) => {
    e.preventDefault()
    if (saving) return
    const patch = {}
    if (title.trim() !== lessonTitle(lesson)) patch.title = title.trim()
    if (date !== lesson.lesson_date) patch.lessonDate = date
    if (!title.trim() || !parseLocalDate(date)) {
      setError(!title.trim() ? 'Le titre ne peut pas être vide.' : 'Indique une date valide.')
      return
    }
    if (!Object.keys(patch).length) {
      onDone()
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(patch)
      if (mounted.current) onDone()
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      setError(err.message || "L'enregistrement a échoué.")
      setSaving(false)
    }
  }

  return (
    <form
      className={styles.metaForm}
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !saving) {
          e.preventDefault()
          onDone()
        }
      }}
      noValidate
    >
      <div className={styles.metaFields}>
        <div className={styles.metaDate}>
          <label htmlFor={`${uid}-date`} className={bits.label}>Date du cours</label>
          <input
            id={`${uid}-date`}
            type="date"
            className={bits.input}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            disabled={saving}
            required
          />
        </div>
        <div className={styles.metaTitle}>
          <label htmlFor={`${uid}-title`} className={bits.label}>Titre</label>
          <input
            id={`${uid}-title`}
            className={bits.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TITLE_MAX}
            disabled={saving}
            autoComplete="off"
            // Opening the editor is an explicit action: focus the title right away
            autoFocus
            required
          />
        </div>
      </div>
      {error && (
        <p className={bits.fieldError} role="alert">
          <Icon icon={CircleAlert} size={16} /> {error}
        </p>
      )}
      <div className={styles.metaActions}>
        <button type="button" className={`${ui.btn} ${ui.small} ${bits.tap}`} onClick={onDone} disabled={saving}>
          Annuler
        </button>
        <button type="submit" className={`${ui.btn} ${ui.small} ${ui.green} ${bits.tap}`} disabled={saving} aria-busy={saving || undefined}>
          {saving && <span className={bits.spinner} aria-hidden="true" />}
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}

/**
 * Colorful header of the teacher lesson page: date + title (editable), status and
 * visibility pills, student link, main actions and the Drive link.
 * @param {{ lesson: object, exerciseCount: number, stale: boolean, busy: boolean,
 *   publishing: boolean, onSaveMeta: (patch: object) => Promise<void>, onPublish: () => void,
 *   onUnpublish: () => void, onTest: () => void, onTestIntent?: () => void, onRegenerate: () => void,
 *   onDelete: () => void, onDriveSave: (url: string) => Promise<void> }} props
 *   `busy`: a regeneration / deletion is being sent. The « Tester » button is forwarded as ref
 *   (focus comes back to it when the preview closes); `onTestIntent` runs when the pointer or
 *   the focus reaches it (the page preloads the player).
 */
const LessonHeader = forwardRef(function LessonHeader(
  {
    lesson,
    exerciseCount,
    stale,
    busy,
    publishing,
    onSaveMeta,
    onPublish,
    onUnpublish,
    onTest,
    onTestIntent,
    onRegenerate,
    onDelete,
    onDriveSave,
    onNotifyStudent,
  },
  testRef
) {
  const [editing, setEditing] = useState(false)
  const editButtonRef = useRef(null)
  const wasEditing = useRef(false)
  const [studentUrl, setStudentUrl] = useState('')

  // Absolute link to the student's page, for the Preply chat (origin known in the browser only)
  useEffect(() => setStudentUrl(`${window.location.origin}/student/lessons/${lesson.id}`), [lesson.id])

  // Focus back on « Modifier » when the inline editor closes
  useEffect(() => {
    if (wasEditing.current && !editing) editButtonRef.current?.focus()
    wasEditing.current = editing
  }, [editing])

  const generating = lesson.status === 'generating'
  const hasContent = Boolean(lesson.content)
  const visible = hasContent && !lesson.hidden
  const studentHref = lesson.student_id ? `/teacher/students/${lesson.student_id}` : null

  return (
    <header className={styles.header} style={accentStyle(lesson.id)}>
      {editing ? (
        <>
          <h1 className="sr-only">{lessonTitle(lesson)}</h1>
          <MetaEditor lesson={lesson} onSave={onSaveMeta} onDone={() => setEditing(false)} />
        </>
      ) : (
        <div className={styles.headTop}>
          <span className={styles.tile} aria-hidden="true">
            <Icon icon={lessonIcon(lesson.id)} size={32} />
          </span>
          <div className={styles.headText}>
            <time className={styles.date} dateTime={lesson.lesson_date || undefined}>
              {formatLessonDate(lesson.lesson_date, { long: true })}
            </time>
            <h1 className={styles.title}>{lessonTitle(lesson)}</h1>
          </div>
          <button
            ref={editButtonRef}
            type="button"
            className={`${ui.btn} ${ui.small} ${bits.blueGhost} ${bits.tap} ${styles.editMeta} no-print`}
            onClick={() => setEditing(true)}
          >
            <Icon icon={Pencil} size={18} />
            <span className={styles.editMetaLabel}>Modifier</span>
            <span className="sr-only"> le titre et la date</span>
          </button>
        </div>
      )}

      <div className={styles.metaRow}>
        {(generating || lesson.status === 'failed') && <StatusBadge status={lesson.status} stale={stale} />}
        {hasContent && (
          <span className={`${styles.visibility} ${visible ? styles.visibilityOn : styles.visibilityOff}`}>
            <Icon icon={visible ? Eye : EyeOff} size={16} />
            {visible ? 'Publié' : 'Brouillon — invisible pour l’élève'}
          </span>
        )}
        {studentHref ? (
          <Link href={studentHref} className={`${styles.metaPill} ${styles.studentLink}`}>
            <Icon icon={User} size={16} />
            <span className={styles.metaText}>{lesson.student_name || 'Élève'}</span>
          </Link>
        ) : (
          <span className={styles.metaPill}>
            <Icon icon={User} size={16} />
            <span className={styles.metaText}>{lesson.student_name || 'Élève supprimé'}</span>
          </span>
        )}
        {hasContent && (
          <span className={styles.metaPill}>
            <Icon icon={ListChecks} size={16} /> {plural(exerciseCount, 'exercice')}
          </span>
        )}
        {lesson.source_kind === 'import' && (
          <span className={styles.metaPill} title={lesson.source_name || undefined}>
            <Icon icon={FileText} size={16} />
            <span className={styles.metaText}>Importée{lesson.source_name ? ` · ${lesson.source_name}` : ''}</span>
          </span>
        )}
      </div>

      <div className={`${styles.actions} no-print`}>
        {hasContent && lesson.hidden && (
          <button type="button" className={`${ui.btn} ${ui.green} ${styles.actionBtn}`} onClick={onPublish} disabled={publishing}>
            {publishing ? <span className={bits.spinner} aria-hidden="true" /> : <Icon icon={Send} size={18} />}
            Publier pour l&apos;élève
          </button>
        )}
        {hasContent && (
          <button
            ref={testRef}
            type="button"
            className={`${ui.btn} ${bits.blueGhost} ${styles.actionBtn}`}
            onClick={onTest}
            onPointerEnter={onTestIntent}
            onFocus={onTestIntent}
            disabled={exerciseCount === 0}
          >
            <Icon icon={Play} size={18} /> Tester les exercices
          </button>
        )}
        <button
          type="button"
          className={`${ui.btn} ${bits.blueGhost} ${styles.actionBtn}`}
          onClick={onRegenerate}
          disabled={busy || (generating && !stale)}
          data-lesson-action="regenerate"
        >
          <Icon icon={RefreshCw} size={18} /> Régénérer
        </button>
      </div>

      <div className={`${styles.secondaryActions} no-print`}>
        {visible && studentUrl && <CopyButton text={studentUrl} label="Copier le lien élève" srLabel="(page de la leçon pour l'élève)" />}
        {visible && onNotifyStudent && (
          <button
            type="button"
            className={`${ui.btn} ${ui.small} ${bits.tap} ${bits.blueGhost}`}
            onClick={onNotifyStudent}
            title="Envoyer un e-mail à l'élève pour le prévenir que sa leçon est prête"
          >
            <Icon icon={Mail} size={16} /> Prévenir par e-mail
          </button>
        )}
        {visible && (
          <button
            type="button"
            className={`${ui.btn} ${ui.small} ${bits.tap} ${bits.redGhost}`}
            onClick={onUnpublish}
            disabled={publishing}
          >
            <Icon icon={EyeOff} size={16} /> Retirer de l&apos;espace élève
          </button>
        )}
        <button
          type="button"
          className={`${ui.btn} ${ui.small} ${bits.tap} ${bits.redGhost}`}
          onClick={onDelete}
          disabled={busy || (generating && !stale)}
        >
          <Icon icon={Trash2} size={16} /> Supprimer
        </button>
      </div>

      {hasContent && (
        <div className={styles.drive}>
          <DriveLinkEditor key={lesson.id} value={lesson.drive_url || ''} onSave={onDriveSave} disabled={busy} />
        </div>
      )}
    </header>
  )
})

export default LessonHeader
