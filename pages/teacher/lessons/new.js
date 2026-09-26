import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import AppShell from '@/components/AppShell'
import { api, ApiError } from '@/utils/apiClient'
import ConfirmDialog from '@/components/teacher/ConfirmDialog'
import GenerationProgress from '@/components/teacher/GenerationProgress'
import { readDraft, removeDraft, writeDraft, hasDraftContent } from '@/components/teacher/lessonDraft'
import {
  LEVEL_LABELS,
  formatLessonDate,
  isAbortError,
  isValidId,
  parseLocalDate,
  plural,
  studentDisplayName,
  todayLocal,
} from '@/components/teacher/format'
import { useBeforeUnload, useMountedRef } from '@/components/teacher/hooks'
import shared from '@/components/teacher/Teacher.module.css'
import styles from '@/components/teacher/NewLesson.module.css'

const MIN_CHARS = 20
const SAVE_DELAY = 600

// A draft keeps its date only if it was saved today; an older draft defaults to today
function draftDate(draft) {
  if (!draft?.lessonDate || !draft.savedAt) return todayLocal()
  const saved = new Date(draft.savedAt)
  const today = new Date()
  return saved.toDateString() === today.toDateString() ? draft.lessonDate : todayLocal()
}

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

function formatSavedAt(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const sameDay = d.toDateString() === new Date().toDateString()
  return sameDay
    ? `aujourd'hui à ${formatTime(ts)}`
    : `le ${d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} à ${formatTime(ts)}`
}

function charCount(n) {
  return `${n.toLocaleString('fr-FR')} caractère${n > 1 ? 's' : ''}`
}

export default function NewLessonPage() {
  const router = useRouter()
  const mounted = useMountedRef()
  const uid = useId()
  const fieldId = (name) => `${uid}-${name}`

  // null until the router is ready (query + localStorage are client-only)
  const [form, setForm] = useState(null)
  const formRef = useRef(form)
  formRef.current = form

  const [students, setStudents] = useState(null)
  const [studentsError, setStudentsError] = useState(null)
  const [missingStudent, setMissingStudent] = useState(false)
  const studentsController = useRef(null)
  const checkedQueryStudent = useRef(false)

  const [restoredAt, setRestoredAt] = useState(null)
  const [conflictDraft, setConflictDraft] = useState(null)
  const [savedAt, setSavedAt] = useState(null)
  const [storageFailed, setStorageFailed] = useState(false)
  const [confirmClear, setConfirmClear] = useState(false)
  const saveTimer = useRef(null)
  const lastSaved = useRef('')

  const [attempted, setAttempted] = useState(false)
  const [submitError, setSubmitError] = useState(null)
  // 'form' | 'generating' | 'done' | 'failed' | 'lost'
  const [phase, setPhase] = useState('form')
  const [startedAt, setStartedAt] = useState(null)
  const [outcome, setOutcome] = useState(null)
  const busyRef = useRef(false)
  const requestController = useRef(null)
  const progressRef = useRef(null)

  useBeforeUnload(phase === 'generating')

  // ---- Init from ?student= and the saved draft ----
  useEffect(() => {
    if (!router.isReady || formRef.current) return
    const q = router.query.student
    const studentId = isValidId(q) ? q : ''
    const draft = readDraft(studentId)
    const initial = {
      studentId,
      lessonDate: draftDate(draft),
      title: draft?.title || '',
      transcript: draft?.transcript || '',
      canva: draft?.canva || '',
    }
    lastSaved.current = draft
      ? JSON.stringify([initial.studentId, initial.lessonDate, initial.title, initial.transcript, initial.canva])
      : ''
    setForm(initial)
    if (draft) {
      setRestoredAt(draft.savedAt || Date.now())
      setSavedAt(draft.savedAt || null)
    }
  }, [router.isReady, router.query.student])

  // ---- Students ----
  const loadStudents = useCallback(async () => {
    studentsController.current?.abort()
    const controller = new AbortController()
    studentsController.current = controller
    setStudentsError(null)
    setStudents(null)
    try {
      const data = await api('/api/teacher/students', { signal: controller.signal })
      if (!mounted.current || controller.signal.aborted) return
      const list = Array.isArray(data.students) ? data.students : []
      setStudents([...list].sort((a, b) => studentDisplayName(a).localeCompare(studentDisplayName(b), 'fr')))
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      setStudentsError(err.message || 'Impossible de charger la liste des élèves.')
    }
  }, [mounted])

  useEffect(() => {
    loadStudents()
    return () => studentsController.current?.abort()
  }, [loadStudents])

  // The ?student= id must exist in the list
  useEffect(() => {
    if (!students || !form || checkedQueryStudent.current) return
    checkedQueryStudent.current = true
    if (form.studentId && !students.some((s) => s.id === form.studentId)) {
      setMissingStudent(true)
      setForm((f) => ({ ...f, studentId: '' }))
    }
  }, [students, form])

  // ---- Draft autosave (debounced) ----
  const flushDraft = useCallback(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = null
    const f = formRef.current
    if (!f) return
    const signature = JSON.stringify([f.studentId, f.lessonDate, f.title, f.transcript, f.canva])
    if (signature === lastSaved.current) return
    const result = writeDraft(f.studentId, f)
    lastSaved.current = result === null ? '' : signature
    if (!mounted.current) return
    if (result === null) {
      setStorageFailed(true)
    } else {
      setStorageFailed(false)
      setSavedAt(result || null)
    }
  }, [mounted])

  useEffect(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = null
    // Paused while a draft conflict is pending, so the other student's draft is not overwritten
    if (!form || phase !== 'form' || conflictDraft) return undefined
    saveTimer.current = setTimeout(flushDraft, SAVE_DELAY)
    return undefined
  }, [form, phase, flushDraft, conflictDraft])

  // Flush a pending save when leaving (unmount, tab hidden/closed) and abort requests
  useEffect(() => {
    const flushPending = () => {
      if (!saveTimer.current) return
      clearTimeout(saveTimer.current)
      saveTimer.current = null
      if (formRef.current) writeDraft(formRef.current.studentId, formRef.current)
    }
    window.addEventListener('pagehide', flushPending)
    return () => {
      window.removeEventListener('pagehide', flushPending)
      flushPending()
      requestController.current?.abort()
    }
  }, [])

  // ---- Field handlers ----
  const setField = (key) => (e) => {
    const { value } = e.target
    setForm((f) => ({ ...f, [key]: value }))
    if (submitError) setSubmitError(null)
  }

  const handleStudentChange = (e) => {
    const newId = e.target.value
    const current = formRef.current
    if (!current || newId === current.studentId) return
    setMissingStudent(false)
    setConflictDraft(null)
    const newDraft = readDraft(newId)
    if (!hasDraftContent(current)) {
      if (newDraft) {
        setForm({
          studentId: newId,
          lessonDate: draftDate(newDraft),
          title: newDraft.title,
          transcript: newDraft.transcript,
          canva: newDraft.canva,
        })
        setRestoredAt(newDraft.savedAt || Date.now())
      } else {
        setForm({ ...current, studentId: newId })
        setRestoredAt(null)
      }
      return
    }
    // The text already typed moves with the selection; the old key is re-saved under the new one.
    clearTimeout(saveTimer.current)
    saveTimer.current = null
    // On conflict the typed text stays saved under its old key until the teacher chooses
    if (!newDraft) removeDraft(current.studentId)
    setForm({ ...current, studentId: newId })
    if (newDraft) setConflictDraft(newDraft)
  }

  const restoreConflictDraft = () => {
    if (!conflictDraft) return
    setForm((f) => ({
      ...f,
      lessonDate: draftDate(conflictDraft),
      title: conflictDraft.title,
      transcript: conflictDraft.transcript,
      canva: conflictDraft.canva,
    }))
    setRestoredAt(conflictDraft.savedAt || Date.now())
    setConflictDraft(null)
  }

  const clearForm = () => {
    clearTimeout(saveTimer.current)
    saveTimer.current = null
    removeDraft(formRef.current?.studentId)
    setForm((f) => ({ ...f, title: '', transcript: '', canva: '', lessonDate: todayLocal() }))
    setRestoredAt(null)
    setSavedAt(null)
    setAttempted(false)
    setConfirmClear(false)
  }

  // ---- Validation ----
  const transcriptLen = form?.transcript.trim().length || 0
  const canvaLen = form?.canva.trim().length || 0
  const errors = useMemo(() => {
    if (!form) return {}
    const e = {}
    if (!form.studentId) e.student = 'Choisis un élève.'
    if (!parseLocalDate(form.lessonDate)) e.date = 'Indique la date du cours.'
    if (transcriptLen < MIN_CHARS && canvaLen < MIN_CHARS) {
      e.sources = `Colle la transcription ou les notes Canva (au moins ${MIN_CHARS} caractères).`
    }
    return e
  }, [form, transcriptLen, canvaLen])

  // ---- Generation ----
  const runGeneration = async (request, { lessonId = null, studentId }) => {
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    busyRef.current = true
    setOutcome(null)
    setSubmitError(null)
    setStartedAt(Date.now())
    setPhase('generating')
    requestAnimationFrame(() => progressRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))

    try {
      const res = await request(controller.signal)
      if (!mounted.current) return
      const lesson = res?.lesson
      if (!lesson?.id) throw new ApiError('Réponse inattendue du serveur.', 500)
      // The lesson row now stores the transcript + notes: the local draft is no longer needed.
      removeDraft(studentId)
      if (lesson.status === 'published') {
        setPhase('done')
        router.push(`/teacher/lessons/${lesson.id}`)
        return
      }
      setOutcome({ lessonId: lesson.id, studentId, error: lesson.error || 'La génération a échoué.' })
      setPhase('failed')
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      const status = err?.status || 0
      if (status >= 400 && status < 500) {
        if (!lessonId) {
          // Rejected before anything was created (validation, unknown student…)
          setSubmitError(err.message)
          setPhase('form')
        } else {
          setOutcome({ lessonId, studentId, error: err.message })
          setPhase('failed')
        }
        return
      }
      // Network error, timeout or 5xx: the lesson may still exist on the server
      setOutcome({ lessonId, studentId, message: err.message })
      setPhase('lost')
    } finally {
      busyRef.current = false
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (busyRef.current || phase !== 'form' || !form) return
    setAttempted(true)
    const order = [
      ['student', fieldId('student')],
      ['date', fieldId('date')],
      ['sources', fieldId('transcript')],
    ]
    const firstInvalid = order.find(([key]) => errors[key])
    if (firstInvalid) {
      document.getElementById(firstInvalid[1])?.focus()
      return
    }
    flushDraft()
    const body = {
      studentId: form.studentId,
      lessonDate: form.lessonDate,
      transcript: form.transcript,
      canva: form.canva,
    }
    if (form.title.trim()) body.title = form.title.trim()
    runGeneration((signal) => api('/api/teacher/lessons', { method: 'POST', body, signal }), {
      studentId: form.studentId,
    })
  }

  const handleRetry = () => {
    if (busyRef.current || !outcome?.lessonId) return
    const { lessonId, studentId } = outcome
    runGeneration(
      (signal) => api(`/api/teacher/lessons/${lessonId}/regenerate`, { method: 'POST', body: {}, signal }),
      { lessonId, studentId }
    )
  }

  // ---- Render ----
  const selected = students && form ? students.find((s) => s.id === form.studentId) : null
  const locked = phase !== 'form'
  const showErrors = attempted
  const backHref = form?.studentId ? `/teacher/students/${form.studentId}` : '/teacher'
  const backLabel = selected ? studentDisplayName(selected) : form?.studentId ? "Fiche de l'élève" : 'Mes élèves'
  const hasContent = form ? hasDraftContent(form) : false

  let statusPanel = null
  if (phase === 'generating') {
    statusPanel = (
      <GenerationProgress
        startedAt={startedAt}
        heading={selected ? `Leçon de ${studentDisplayName(selected)} en préparation…` : undefined}
      />
    )
  } else if (phase === 'done') {
    statusPanel = (
      <div className={`alert alert-success ${styles.bigAlert}`} role="status">
        <span className="spinner" aria-hidden="true" /> Leçon publiée ! Ouverture de la leçon…
      </div>
    )
  } else if (phase === 'failed' && outcome) {
    statusPanel = (
      <section className={styles.outcome} role="alert" aria-labelledby={fieldId('failed-title')}>
        <div className={styles.outcomeIcon} aria-hidden="true">⚠️</div>
        <div className={styles.outcomeBody}>
          <h2 id={fieldId('failed-title')} className={styles.outcomeTitle}>La génération a échoué</h2>
          <p className={styles.outcomeError}>{outcome.error}</p>
          <p className={styles.outcomeText}>
            La leçon est enregistrée avec ta transcription et tes notes : tu peux relancer la génération sans
            rien recoller.
          </p>
          <div className={styles.outcomeActions}>
            <button type="button" className="btn btn-primary" onClick={handleRetry}>
              🔄 Réessayer
            </button>
            <Link href={`/teacher/lessons/${outcome.lessonId}`} className="btn btn-secondary">
              Voir la leçon
            </Link>
          </div>
        </div>
      </section>
    )
  } else if (phase === 'lost' && outcome) {
    statusPanel = (
      <section className={`${styles.outcome} ${styles.outcomeWarning}`} role="alert" aria-labelledby={fieldId('lost-title')}>
        <div className={styles.outcomeIcon} aria-hidden="true">📡</div>
        <div className={styles.outcomeBody}>
          <h2 id={fieldId('lost-title')} className={styles.outcomeTitle}>La connexion a été interrompue</h2>
          <p className={styles.outcomeError}>{outcome.message}</p>
          <p className={styles.outcomeText}>
            {outcome.lessonId
              ? 'La génération continue peut-être sur le serveur. Ouvre la leçon pour voir son état.'
              : "La leçon a peut-être quand même été créée. Vérifie la page de l'élève avant de réessayer, pour éviter un doublon. Ton texte est toujours enregistré ici."}
          </p>
          <div className={styles.outcomeActions}>
            {outcome.lessonId ? (
              <Link href={`/teacher/lessons/${outcome.lessonId}`} className="btn btn-primary">
                Voir la leçon
              </Link>
            ) : (
              <Link href={`/teacher/students/${outcome.studentId}`} className="btn btn-primary">
                Voir la page de l&apos;élève
              </Link>
            )}
            {!outcome.lessonId && (
              <button type="button" className="btn btn-secondary" onClick={() => setPhase('form')}>
                Revenir au formulaire
              </button>
            )}
          </div>
        </div>
      </section>
    )
  }

  const hideForm = phase === 'failed' || phase === 'lost'

  return (
    <div className={shared.page}>
      <Head>
        <title>Nouvelle leçon — Preply Lessons</title>
      </Head>
      <AppShell
        title="Nouvelle leçon"
        back={phase === 'generating' || phase === 'done' ? undefined : { href: backHref, label: backLabel }}
      >
        <div className={shared.stack}>
          {statusPanel && <div ref={progressRef} className={styles.statusAnchor}>{statusPanel}</div>}

          {!hideForm && (
            <form className={`dashboard-section ${styles.card}`} onSubmit={handleSubmit} noValidate aria-busy={locked}>
              {!form ? (
                <div className={styles.formLoading} role="status">
                  <span className="spinner" aria-hidden="true" /> Chargement du formulaire…
                </div>
              ) : (
                <fieldset className={styles.fieldset} disabled={locked}>
                  <legend className="sr-only">Informations de la leçon</legend>

                  {restoredAt && phase === 'form' && (
                    <div className={`alert ${styles.infoAlert}`} role="status">
                      <span>
                        📝 Brouillon restauré (enregistré {formatSavedAt(restoredAt)}).
                      </span>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmClear(true)}>
                        Effacer le brouillon
                      </button>
                    </div>
                  )}

                  {conflictDraft && phase === 'form' && (
                    <div className={`alert ${shared.alertWarning} ${styles.infoAlert}`} role="status">
                      <span>
                        Un autre brouillon existe pour cet élève (enregistré {formatSavedAt(conflictDraft.savedAt)}).
                      </span>
                      <span className={styles.inlineButtons}>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={restoreConflictDraft}>
                          Remplacer par ce brouillon
                        </button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setConflictDraft(null)}>
                          Garder mon texte
                        </button>
                      </span>
                    </div>
                  )}

                  {missingStudent && (
                    <div className={`alert ${shared.alertWarning} ${shared.inlineAlert}`} role="alert">
                      L&apos;élève indiqué dans le lien est introuvable. Choisis-le dans la liste.
                    </div>
                  )}

                  <div className={styles.row}>
                    <div className="form-group">
                      <label htmlFor={fieldId('student')} className="label">Élève</label>
                      <select
                        id={fieldId('student')}
                        className={`select ${showErrors && errors.student ? styles.invalid : ''}`}
                        value={students ? form.studentId : ''}
                        onChange={handleStudentChange}
                        disabled={!students}
                        aria-invalid={(showErrors && Boolean(errors.student)) || undefined}
                        aria-describedby={showErrors && errors.student ? fieldId('student-error') : undefined}
                      >
                        {!students ? (
                          <option value="">{studentsError ? 'Liste indisponible' : 'Chargement des élèves…'}</option>
                        ) : (
                          <>
                            <option value="">Choisir un élève…</option>
                            {students.map((s) => (
                              <option key={s.id} value={s.id}>
                                {studentDisplayName(s)}
                                {s.full_name?.trim() ? ` (${s.email})` : ''}
                              </option>
                            ))}
                          </>
                        )}
                      </select>
                      {showErrors && errors.student && (
                        <p id={fieldId('student-error')} className={styles.fieldError}>{errors.student}</p>
                      )}
                      {studentsError && (
                        <p className={styles.fieldError} role="alert">
                          {studentsError}{' '}
                          <button type="button" className={styles.linkButton} onClick={loadStudents}>
                            Réessayer
                          </button>
                        </p>
                      )}
                      {selected && (
                        <p className={styles.hint}>
                          {LEVEL_LABELS[selected.level] || LEVEL_LABELS.unknown} ·{' '}
                          {plural(selected.lesson_count || 0, 'leçon')}
                          {selected.last_lesson_date && ` · dernière le ${formatLessonDate(selected.last_lesson_date)}`}
                        </p>
                      )}
                    </div>

                    <div className="form-group">
                      <label htmlFor={fieldId('date')} className="label">Date du cours</label>
                      <input
                        id={fieldId('date')}
                        type="date"
                        className={`input ${showErrors && errors.date ? styles.invalid : ''}`}
                        value={form.lessonDate}
                        onChange={setField('lessonDate')}
                        aria-invalid={(showErrors && Boolean(errors.date)) || undefined}
                        aria-describedby={showErrors && errors.date ? fieldId('date-error') : undefined}
                        required
                      />
                      {showErrors && errors.date && (
                        <p id={fieldId('date-error')} className={styles.fieldError}>{errors.date}</p>
                      )}
                    </div>
                  </div>

                  <div className="form-group">
                    <label htmlFor={fieldId('title')} className="label">
                      Titre <span className={styles.optional}>(facultatif)</span>
                    </label>
                    <input
                      id={fieldId('title')}
                      className="input"
                      value={form.title}
                      onChange={setField('title')}
                      placeholder="Laisse vide : l'IA proposera un titre"
                      maxLength={120}
                      autoComplete="off"
                    />
                  </div>

                  <div className="form-group">
                    <div className={styles.labelRow}>
                      <label htmlFor={fieldId('transcript')} className="label">Transcription</label>
                      <span className={styles.counter}>{charCount(transcriptLen)}</span>
                    </div>
                    <textarea
                      id={fieldId('transcript')}
                      className={`textarea ${styles.bigTextarea} ${showErrors && errors.sources ? styles.invalid : ''}`}
                      value={form.transcript}
                      onChange={setField('transcript')}
                      rows={14}
                      placeholder="Colle ici la transcription Preply du cours…"
                      spellCheck={false}
                      aria-invalid={(showErrors && Boolean(errors.sources)) || undefined}
                      aria-describedby={`${fieldId('sources-hint')}${showErrors && errors.sources ? ` ${fieldId('sources-error')}` : ''}`}
                    />
                  </div>

                  <div className="form-group">
                    <div className={styles.labelRow}>
                      <label htmlFor={fieldId('canva')} className="label">Notes Canva</label>
                      <span className={styles.counter}>{charCount(canvaLen)}</span>
                    </div>
                    <textarea
                      id={fieldId('canva')}
                      className={`textarea ${styles.midTextarea} ${showErrors && errors.sources ? styles.invalid : ''}`}
                      value={form.canva}
                      onChange={setField('canva')}
                      rows={8}
                      placeholder="Colle ici le texte de tes notes Canva…"
                      spellCheck={false}
                      aria-invalid={(showErrors && Boolean(errors.sources)) || undefined}
                      aria-describedby={`${fieldId('sources-hint')}${showErrors && errors.sources ? ` ${fieldId('sources-error')}` : ''}`}
                    />
                  </div>

                  <p id={fieldId('sources-hint')} className={styles.hint}>
                    Au moins l&apos;un des deux est nécessaire ({MIN_CHARS} caractères minimum). Ton texte est
                    enregistré automatiquement sur cet appareil jusqu&apos;à la génération.
                  </p>
                  {showErrors && errors.sources && (
                    <p id={fieldId('sources-error')} className={styles.fieldError}>{errors.sources}</p>
                  )}
                </fieldset>
              )}

              {submitError && (
                <div className={`alert alert-error ${shared.inlineAlert} ${styles.submitAlert}`} role="alert">
                  ⚠️ {submitError}
                </div>
              )}

              {form && (
                <div className={styles.footer}>
                  <div className={styles.saveState}>
                    {storageFailed
                      ? '⚠️ Brouillon non enregistré (stockage du navigateur indisponible)'
                      : savedAt && hasContent
                        ? `Brouillon enregistré à ${formatTime(savedAt)}`
                        : ''}
                  </div>
                  <div className={styles.footerButtons}>
                    {hasContent && !locked && (
                      <button type="button" className="btn btn-ghost" onClick={() => setConfirmClear(true)}>
                        Vider le formulaire
                      </button>
                    )}
                    <button
                      type="submit"
                      className={`btn btn-primary btn-lg ${styles.submit}`}
                      disabled={locked || !students}
                      aria-busy={phase === 'generating' || undefined}
                    >
                      {phase === 'generating' ? (
                        <>
                          <span className={`spinner ${styles.btnSpinner}`} aria-hidden="true" /> Génération en cours…
                        </>
                      ) : (
                        '✨ Générer la leçon'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </form>
          )}
        </div>

        <ConfirmDialog
          open={confirmClear}
          title="Vider le formulaire ?"
          message="Le titre, la transcription et les notes Canva seront effacés, ainsi que le brouillon enregistré."
          confirmLabel="Vider"
          danger
          onConfirm={clearForm}
          onCancel={() => setConfirmClear(false)}
        />
      </AppShell>
    </div>
  )
}
