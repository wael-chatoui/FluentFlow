import { useId, useMemo, useState } from 'react'
import Head from 'next/head'
import { useRouter } from 'next/router'
import { api, ApiError } from '@/utils/apiClient'
import useUnsavedGuard from '@/components/ui/useUnsavedGuard'
import ConfirmDialog from '@/components/teacher/ConfirmDialog'
import TeacherShell from '@/components/teacher/TeacherShell'
import StepCard from '@/components/teacher/import/StepCard'
import BackLink from '@/components/teacher/lessons/BackLink'
import OptionsDisclosure, { hasOptionErrors, optionsToSend } from '@/components/teacher/lessons/OptionsDisclosure'
import { PasteButton, SourceCounter, appendText } from '@/components/teacher/lessons/SourceInput'
import StudentPicker, { CHIP_LIMIT } from '@/components/teacher/lessons/StudentPicker'
import useLessonDraft from '@/components/teacher/lessons/useLessonDraft'
import { hasDraftContent, readPref, writePref } from '@/components/teacher/lessonDraft'
import {
  LEVEL_LABELS,
  SOURCE_LIMITS,
  SOURCE_MIN_CHARS,
  formatLessonDate,
  isAbortError,
  isValidId,
  parseLocalDate,
  plural,
  sourcesError,
  studentDisplayName,
  todayLocal,
} from '@/components/teacher/format'
import { useApiResource, useMountedRef } from '@/components/teacher/hooks'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/NewLesson.module.css'

const REVIEW_PREF = 'reviewBeforePublish'
const LEAVE_WHILE_SENDING = "La leçon est en cours d'envoi. Quitter maintenant peut l'interrompre. Quitter quand même ?"

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

function Banner({ tone, icon, children, actions, role = 'status' }) {
  return (
    <div className={`${bits.alert} ${bits[tone]}`} role={role}>
      <span className={bits.alertIcon} aria-hidden="true">{icon}</span>
      <div className={bits.alertBody}>
        <span>{children}</span>
        {actions && <div className={bits.alertActions}>{actions}</div>}
      </div>
    </div>
  )
}

export default function NewLessonPage() {
  const router = useRouter()
  const mounted = useMountedRef()
  const uid = useId()
  const fieldId = (name) => `${uid}-${name}`

  const studentsRes = useApiResource('/api/teacher/students', {
    errorMessage: 'Impossible de charger la liste des élèves.',
  })
  const students = useMemo(() => {
    const list = studentsRes.data?.students
    if (!Array.isArray(list)) return null
    return [...list].sort((a, b) => studentDisplayName(a).localeCompare(studentDisplayName(b), 'fr'))
  }, [studentsRes.data])

  const [phase, setPhase] = useState('form') // 'form' | 'sending' | 'redirecting'
  const draft = useLessonDraft({
    ready: router.isReady,
    queryStudent: router.query.student,
    students,
    paused: phase === 'redirecting',
  })
  const { form, restored, conflict } = draft
  const bypassGuard = useUnsavedGuard(phase === 'sending', LEAVE_WHILE_SENDING)

  const [review, setReview] = useState(() => readPref(REVIEW_PREF) === '1')
  const [confirmClear, setConfirmClear] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const [submitError, setSubmitError] = useState(null)

  // ---- Field handlers ----
  const update = (patch) => {
    draft.update(patch)
    if (submitError) setSubmitError(null)
  }
  const setField = (key) => (e) => update({ [key]: e.target.value })
  const setOptions = (next) => update((f) => ({ options: typeof next === 'function' ? next(f.options) : next }))

  const toggleReview = (e) => {
    setReview(e.target.checked)
    writePref(REVIEW_PREF, e.target.checked ? '1' : '0')
  }

  const clearForm = () => {
    draft.clear()
    setAttempted(false)
    setSubmitError(null)
    setConfirmClear(false)
  }

  // ---- Validation (same rules as the API) ----
  const errors = useMemo(() => {
    if (!form) return {}
    const e = {}
    if (!form.studentId) e.student = 'Choisis un élève.'
    if (!parseLocalDate(form.lessonDate)) e.date = 'Indique la date du cours.'
    const sources = sourcesError(form.transcript, form.canva)
    if (sources) e.sources = sources
    if (hasOptionErrors(form.options)) e.options = 'Corrige les options des exercices.'
    return e
  }, [form])

  // ---- Submit: the API answers right away (202), the lesson page shows the progress ----
  const handleSubmit = async (e) => {
    e.preventDefault()
    // !students: same as the disabled button (⌘/Ctrl+Entrée calls requestSubmit() anyway)
    if (phase !== 'form' || !form || !students) return
    if (conflict) {
      // Sending now would silently replace the student's other saved draft
      setSubmitError('Un autre brouillon existe : choisis d’abord « Remplacer par ce brouillon » ou « Garder mon texte ».')
      document.getElementById(fieldId('conflict'))?.focus()
      return
    }
    setAttempted(true)
    const order = [
      ['student', fieldId('student')],
      ['date', fieldId('date')],
      ['sources', fieldId('transcript')],
      ['options', null],
    ]
    const firstInvalid = order.find(([key]) => errors[key])
    if (firstInvalid) {
      if (firstInvalid[1]) document.getElementById(firstInvalid[1])?.focus()
      return
    }

    // Mark the draft as sent: if the answer is lost, the next visit says so (and the
    // same clientKey makes a retry return the lesson already created, never a duplicate)
    const sent = draft.markSent()
    const body = {
      studentId: sent.studentId,
      lessonDate: sent.lessonDate,
      transcript: sent.transcript,
      canva: sent.canva,
      clientKey: sent.clientKey,
      publish: !review,
    }
    if (sent.title.trim()) body.title = sent.title.trim()
    // « Laisser l'IA choisir »: nothing sent; any fixed setting is sent as shown (even 10)
    const options = optionsToSend(sent.options)
    if (options) body.options = options

    setPhase('sending')
    setSubmitError(null)
    try {
      const res = await api('/api/teacher/lessons', { method: 'POST', body })
      const lessonId = res?.lesson?.id
      if (!isValidId(lessonId)) throw new ApiError('Réponse inattendue du serveur.', 500)
      // Done even if the page was left meanwhile: the lesson row now holds the sources
      draft.finish(sent.studentId)
      if (!mounted.current) return
      setPhase('redirecting')
      bypassGuard.current = true
      router.push(`/teacher/lessons/${lessonId}${res.duplicate ? '?duplicate=1' : ''}`)
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      setPhase('form')
      const status = err?.status || 0
      // Rejected (validation, unknown student…): nothing was created, the draft is not "sent"
      if (status >= 400 && status < 500) draft.update({ submittedAt: 0 })
      setSubmitError(
        status === 0 || status >= 500
          ? `${err.message} Ton texte est conservé. Si la leçon a quand même été créée, un nouvel essai t'y mènera directement (pas de doublon).`
          : err.message
      )
    }
  }

  // ---- Render ----
  const selected = students && form ? students.find((s) => s.id === form.studentId) : null
  const locked = phase !== 'form'
  const showErrors = attempted
  const backHref = form?.studentId ? `/teacher/students/${form.studentId}` : '/teacher'
  const backLabel = selected ? studentDisplayName(selected) : form?.studentId ? "Fiche de l'élève" : 'Mes élèves'
  const hasContent = form ? hasDraftContent(form) : false
  const sourcesDescribedBy = `${fieldId('sources-hint')}${showErrors && errors.sources ? ` ${fieldId('sources-error')}` : ''}`
  const draftPill = !form
    ? null
    : draft.storageFailed
      ? { tone: styles.pillWarn, icon: '⚠️', text: 'Brouillon non enregistré (stockage du navigateur indisponible)' }
      : draft.savedAt && hasContent
        ? { tone: '', icon: '💾', text: `Brouillon enregistré à ${formatTime(draft.savedAt)}` }
        : null
  const notToday = form && form.lessonDate !== todayLocal()

  return (
    <TeacherShell>
      <Head>
        <title>Nouvelle leçon — Preply Lessons</title>
      </Head>

      <BackLink href={backHref} label={backLabel} />

      <div className={styles.page}>
        <div className={styles.pageHead}>
          <h1 className={styles.pageTitle}>
            <span className={styles.pageEmoji} aria-hidden="true">✨</span> Nouvelle leçon
          </h1>
          <p className={styles.pageSub}>
            Colle la transcription et tes notes Canva : l&apos;IA prépare le bilan et les exercices.
          </p>
          {(draftPill || (hasContent && !locked && !conflict)) && (
            <div className={styles.draftRow}>
              {draftPill && (
                <span className={`${styles.draftPill} ${draftPill.tone}`}>
                  <span aria-hidden="true">{draftPill.icon}</span> {draftPill.text}
                </span>
              )}
              {/* During a draft conflict the banner's two choices come first */}
              {hasContent && !locked && !conflict && (
                <button
                  type="button"
                  className={`${ui.btn} ${ui.small} ${bits.redGhost} ${bits.tap}`}
                  onClick={() => setConfirmClear(true)}
                >
                  <span aria-hidden="true">🧹</span> Vider le formulaire
                </button>
              )}
            </div>
          )}
        </div>

        <form
          className={`${styles.form} ${locked ? styles.locked : ''}`}
          onSubmit={handleSubmit}
          onKeyDown={(e) => {
            // ⌘/Ctrl + Entrée sends the form from any field
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              e.currentTarget.requestSubmit()
            }
          }}
          noValidate
          aria-busy={locked}
        >
          {!form ? (
            <div className={styles.formLoading}>
              <span className="sr-only" role="status">
                Chargement du formulaire…
              </span>
              <span className={`${ui.skel} ${styles.skelCard}`} aria-hidden="true" />
              <span className={`${ui.skel} ${styles.skelCard}`} aria-hidden="true" />
              <span className={`${ui.skel} ${styles.skelCard} ${styles.skelTall}`} aria-hidden="true" />
            </div>
          ) : (
            <fieldset className={styles.fieldset} disabled={locked}>
              <legend className="sr-only">Informations de la leçon</legend>

              {restored && !conflict && (
                restored.submittedAt ? (
                  <Banner
                    tone="warning"
                    icon="📨"
                    actions={
                      <button type="button" className={`${ui.btn} ${ui.small} ${bits.redGhost} ${bits.tap}`} onClick={() => setConfirmClear(true)}>
                        Effacer le brouillon
                      </button>
                    }
                  >
                    Ce brouillon a déjà été envoyé {formatSavedAt(restored.submittedAt)}, mais la réponse n&apos;est pas
                    arrivée : la leçon a peut-être été créée. Clique sur « Générer » : si elle existe, tu seras redirigé
                    vers elle, sans doublon.
                  </Banner>
                ) : (
                  <Banner
                    tone="info"
                    icon="📝"
                    actions={
                      <>
                        {notToday && (
                          <button type="button" className={`${ui.btn} ${ui.small} ${bits.tap}`} onClick={() => update({ lessonDate: todayLocal() })}>
                            Mettre la date d&apos;aujourd&apos;hui
                          </button>
                        )}
                        <button type="button" className={`${ui.btn} ${ui.small} ${bits.redGhost} ${bits.tap}`} onClick={() => setConfirmClear(true)}>
                          Effacer le brouillon
                        </button>
                      </>
                    }
                  >
                    Brouillon restauré (enregistré {formatSavedAt(restored.savedAt)}). Date du cours :{' '}
                    <strong>{formatLessonDate(form.lessonDate, { long: true })}</strong>
                    {notToday ? " — ce n'est pas aujourd'hui, vérifie-la." : '.'}
                  </Banner>
                )
              )}

              {conflict && (
                <Banner
                  tone="warning"
                  icon="🗂️"
                  actions={
                    <>
                      <button
                        id={fieldId('conflict')}
                        type="button"
                        className={`${ui.btn} ${ui.small} ${ui.orange} ${bits.tap}`}
                        onClick={() => {
                          draft.takeConflictDraft()
                          setSubmitError(null)
                        }}
                      >
                        Remplacer par ce brouillon
                      </button>
                      <button
                        type="button"
                        className={`${ui.btn} ${ui.small} ${bits.tap}`}
                        onClick={() => {
                          draft.keepTypedText()
                          setSubmitError(null)
                        }}
                      >
                        Garder mon texte
                      </button>
                    </>
                  }
                >
                  {form.studentId ? 'Un autre brouillon existe pour cet élève' : 'Un brouillon sans élève choisi existe déjà'}{' '}
                  (enregistré {formatSavedAt(conflict.draft.savedAt)}).
                </Banner>
              )}

              {draft.missingStudent && (
                <Banner tone="warning" icon="🔍" role="alert">
                  L&apos;élève indiqué dans le lien est introuvable. Choisis-le dans la liste.
                </Banner>
              )}

              <StepCard
                id={fieldId('student-title')}
                number="1"
                tone="blue"
                title="Élève"
                htmlFor={students && students.length > CHIP_LIMIT ? fieldId('student') : undefined}
              >
                <StudentPicker
                  id={fieldId('student')}
                  labelledBy={fieldId('student-title')}
                  students={students}
                  error={studentsRes.error}
                  value={students ? form.studentId : ''}
                  onChange={(e) => draft.changeStudent(e.target.value)}
                  onRetry={studentsRes.reload}
                  invalid={showErrors && Boolean(errors.student)}
                  describedBy={showErrors && errors.student ? fieldId('student-error') : undefined}
                />
                {showErrors && errors.student && (
                  <p id={fieldId('student-error')} className={bits.fieldError}>
                    <span aria-hidden="true">⚠️</span> {errors.student}
                  </p>
                )}
                {selected && (
                  <p className={bits.hint}>
                    {LEVEL_LABELS[selected.level] || LEVEL_LABELS.unknown} · {plural(selected.lesson_count || 0, 'leçon')}
                    {selected.last_lesson_date && ` · dernière le ${formatLessonDate(selected.last_lesson_date)}`}
                  </p>
                )}
              </StepCard>

              <StepCard id={fieldId('when-title')} number="2" tone="purple" title="Date & titre">
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label htmlFor={fieldId('date')} className={bits.label}>Date du cours</label>
                    <input
                      id={fieldId('date')}
                      type="date"
                      className={`${bits.input} ${showErrors && errors.date ? bits.invalid : ''}`}
                      value={form.lessonDate}
                      onChange={setField('lessonDate')}
                      aria-invalid={(showErrors && Boolean(errors.date)) || undefined}
                      aria-describedby={showErrors && errors.date ? fieldId('date-error') : undefined}
                      required
                    />
                    {showErrors && errors.date && (
                      <p id={fieldId('date-error')} className={bits.fieldError}>
                        <span aria-hidden="true">⚠️</span> {errors.date}
                      </p>
                    )}
                  </div>
                  <div className={styles.field}>
                    <label htmlFor={fieldId('title')} className={bits.label}>
                      Titre <span className={bits.optional}>(facultatif)</span>
                    </label>
                    <input
                      id={fieldId('title')}
                      className={bits.input}
                      value={form.title}
                      onChange={setField('title')}
                      placeholder="Laisse vide : l'IA proposera un titre"
                      maxLength={120}
                      autoComplete="off"
                    />
                  </div>
                </div>
              </StepCard>

              <StepCard
                id={fieldId('transcript-title')}
                number="3"
                tone="orange"
                title="Transcription"
                htmlFor={fieldId('transcript')}
                sub={
                  <>
                    <span aria-hidden="true">📋 </span>Colle ici la transcription Preply
                  </>
                }
                aside={<SourceCounter value={form.transcript} max={SOURCE_LIMITS.transcript} />}
              >
                <textarea
                  id={fieldId('transcript')}
                  className={`${bits.textarea} ${styles.bigTextarea} ${showErrors && errors.sources ? bits.invalid : ''}`}
                  value={form.transcript}
                  onChange={setField('transcript')}
                  rows={14}
                  placeholder="Colle ici la transcription Preply du cours…"
                  spellCheck={false}
                  aria-invalid={(showErrors && Boolean(errors.sources)) || undefined}
                  aria-describedby={sourcesDescribedBy}
                />
                <PasteButton
                  targetId={fieldId('transcript')}
                  onPaste={(text) => update((f) => ({ transcript: appendText(f.transcript, text) }))}
                  disabled={locked}
                  what="la transcription"
                />
              </StepCard>

              <StepCard
                id={fieldId('canva-title')}
                number="4"
                tone="pink"
                title="Notes Canva"
                htmlFor={fieldId('canva')}
                sub={
                  <>
                    <span aria-hidden="true">🎨 </span>Colle ici le texte de tes notes Canva
                  </>
                }
                aside={<SourceCounter value={form.canva} max={SOURCE_LIMITS.canva} />}
              >
                <textarea
                  id={fieldId('canva')}
                  className={`${bits.textarea} ${styles.midTextarea} ${showErrors && errors.sources ? bits.invalid : ''}`}
                  value={form.canva}
                  onChange={setField('canva')}
                  rows={8}
                  placeholder="Colle ici le texte de tes notes Canva…"
                  spellCheck={false}
                  aria-invalid={(showErrors && Boolean(errors.sources)) || undefined}
                  aria-describedby={sourcesDescribedBy}
                />
                <PasteButton
                  targetId={fieldId('canva')}
                  onPaste={(text) => update((f) => ({ canva: appendText(f.canva, text) }))}
                  disabled={locked}
                  what="les notes Canva"
                />
              </StepCard>

              <div className={styles.sourcesNote}>
                <p id={fieldId('sources-hint')} className={styles.sourcesHint}>
                  <span aria-hidden="true">💡 </span>
                  Au moins l&apos;un des deux est nécessaire ({SOURCE_MIN_CHARS} caractères minimum, hors espaces). Ton
                  texte est enregistré automatiquement sur cet appareil jusqu&apos;à l&apos;envoi.
                </p>
                {showErrors && errors.sources && (
                  <p id={fieldId('sources-error')} className={bits.fieldError}>
                    <span aria-hidden="true">⚠️</span> {errors.sources}
                  </p>
                )}
              </div>

              <OptionsDisclosure
                value={form.options}
                onChange={setOptions}
                disabled={locked}
                allowAuto
                hint="Réglages pour cette leçon uniquement."
              />

              <label className={styles.review}>
                <input type="checkbox" checked={review} onChange={toggleReview} aria-describedby={fieldId('review-hint')} />
                <span className={styles.reviewText}>
                  <span className={styles.reviewTitle}>Relire avant de publier</span>
                  <span id={fieldId('review-hint')} className={styles.reviewHint}>
                    {review
                      ? "La leçon sera créée en brouillon, invisible pour l'élève, jusqu'à ce que tu la publies."
                      : "Décoché : l'élève voit la leçon dès qu'elle est prête."}
                  </span>
                </span>
              </label>
            </fieldset>
          )}

          {submitError && (
            <Banner tone="error" icon="⚠️" role="alert">
              {submitError}
            </Banner>
          )}

          {form && (
            <div className={`${styles.actionBar} no-print`}>
              <button
                type="submit"
                className={`${ui.btn} ${ui.green} ${ui.block} ${styles.submit}`}
                disabled={locked || !students}
                aria-busy={locked || undefined}
                aria-describedby={fieldId('shortcut')}
              >
                {locked ? (
                  <>
                    <span className={bits.spinner} aria-hidden="true" /> Envoi…
                  </>
                ) : (
                  <>
                    <span aria-hidden="true">✨</span> {review ? 'Générer en brouillon' : 'Générer et publier'}
                  </>
                )}
              </button>
              <p id={fieldId('shortcut')} className={styles.shortcut}>
                Raccourci : ⌘ / Ctrl + Entrée
              </p>
            </div>
          )}
        </form>
      </div>

      <ConfirmDialog
        open={confirmClear}
        title="Vider le formulaire ?"
        message="Le titre, la transcription, les notes Canva et les options seront effacés, ainsi que le brouillon enregistré."
        confirmLabel="Vider"
        icon="🧹"
        danger
        onConfirm={clearForm}
        onCancel={() => setConfirmClear(false)}
      />
    </TeacherShell>
  )
}
