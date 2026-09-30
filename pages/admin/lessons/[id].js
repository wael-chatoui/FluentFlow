import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import AdminShell from '@/components/admin/AdminShell'
import ConfirmDialog from '@/components/admin/common/ConfirmDialog'
import Modal from '@/components/admin/common/Modal'
import { useToast, ToastViewport } from '@/components/admin/common/Toast'
import useAdminQuery from '@/components/admin/common/useAdminQuery'
import { cx, isAbortError, isValidId } from '@/components/admin/common/format'
import HistorySection from '@/components/admin/audit/HistorySection'
import LessonView from '@/components/lesson/LessonView'
import ExerciseReview from '@/components/teacher/ExerciseReview'
import ContentTab from '@/components/admin/lessons/ContentTab'
import EditorTabs from '@/components/admin/lessons/EditorTabs'
import ExercisesTab from '@/components/admin/lessons/ExercisesTab'
import LessonHeader from '@/components/admin/lessons/LessonHeader'
import MetadataTab from '@/components/admin/lessons/MetadataTab'
import SaveBar from '@/components/admin/lessons/SaveBar'
import SessionsTab from '@/components/admin/lessons/SessionsTab'
import SourcesTab from '@/components/admin/lessons/SourcesTab'
import useUnsavedGuard from '@/components/ui/useUnsavedGuard'
import { lessonTitle } from '@/components/admin/lessons/constants'
import {
  FIELD_LABELS,
  buildPatch,
  changedFields,
  errorsFor,
  exercisesResetProgress,
  mergeAfterSave,
  stripKeys,
  toDraft,
  validateDraft,
} from '@/components/admin/lessons/editorModel'
import { api } from '@/utils/apiClient'
import admin from '@/components/admin/common/admin.module.css'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/admin/lessons/editor.module.css'

const META_FIELDS = ['title', 'lessonDate', 'status', 'studentId', 'hidden', 'driveUrl']
const EDITABLE_TABS = ['meta', 'content', 'exercises']
const POLL_MS = 5000

function tabForError(path) {
  if (path.startsWith('content')) return 'content'
  if (path.startsWith('exercises')) return 'exercises'
  return 'meta'
}

/**
 * Banner above the editor while the lesson is (or seems stuck) generating. The
 * visibility stays changeable meanwhile (the generation never touches it). A stuck
 * generation ends with the first save, which must give it a status.
 */
function GenerationBanner({ lesson, onToggleHidden, toggling, onChooseStatus }) {
  if (lesson.status !== 'generating') return null
  if (lesson.stale) {
    return (
      <div className={cx(admin.alert, admin.alertWarn)} role="status">
        <span aria-hidden="true">⚠️</span>
        <span className={admin.alertText}>
          Génération bloquée depuis plus de 5 minutes. Pour la débloquer, choisis un statut (Publiée ou Échec) et
          enregistre, avec tes autres corrections si besoin ; ou relance-la depuis l’espace prof.
        </span>
        <button type="button" className={cx(ui.btn, ui.small, admin.tap)} onClick={onChooseStatus}>
          Choisir un statut
        </button>
      </div>
    )
  }
  return (
    <div className={cx(admin.alert, admin.alertInfo)} role="status">
      <span className={admin.spinner} aria-hidden="true" />
      <span className={admin.alertText}>
        Génération en cours… La leçon est en lecture seule jusqu’à la fin ; cette page se met à jour toute seule.{' '}
        {lesson.hidden ? 'Elle restera en brouillon (invisible pour l’élève).' : 'L’élève la verra dès qu’elle sera prête.'}
      </span>
      <button
        type="button"
        className={cx(ui.btn, ui.small, admin.tap)}
        onClick={onToggleHidden}
        disabled={toggling}
        aria-busy={toggling || undefined}
      >
        {toggling && <span className={admin.spinner} aria-hidden="true" />}
        {lesson.hidden ? 'Publier pour l’élève' : 'Retirer de l’espace élève'}
      </button>
    </div>
  )
}

/**
 * Unsaved edits kept while the lesson changed on the server (a generation started, the
 * teacher edited it…): saving them goes through the conflict dialog.
 */
function KeptEditsNotice({ fields, generating, onDiscard }) {
  return (
    <div className={cx(admin.alert, admin.alertWarn)} role="status">
      <span aria-hidden="true">📝</span>
      <span className={admin.alertText}>
        La leçon a changé depuis que tu as commencé à la modifier{generating ? ' (génération en cours)' : ''}. Tes
        modifications non enregistrées ({fields.map((f) => FIELD_LABELS[f]).join(', ')}) sont conservées :{' '}
        {generating ? 'une fois la génération terminée, ' : ''}« Enregistrer » te proposera d’écraser la nouvelle version
        ou de la recharger.
      </span>
      <button type="button" className={cx(ui.btn, ui.small, admin.tap)} onClick={onDiscard}>
        Abandonner mes modifications
      </button>
    </div>
  )
}

export default function AdminLessonEditorPage() {
  const router = useRouter()
  const toast = useToast()
  const id = router.isReady ? router.query.id : undefined
  const validId = isValidId(id)

  const { data, error, loading, reload, setData } = useAdminQuery(validId ? `/api/admin/lessons/${id}` : null)
  const lesson = data?.lesson && data.lesson.id === id?.toLowerCase() ? data.lesson : null

  const [original, setOriginal] = useState(null)
  const [draft, setDraft] = useState(null)
  // Version the draft was made from ({ id, updatedAt }): sent as expectedUpdatedAt
  const [base, setBase] = useState(null)
  const [tab, setTab] = useState('meta')
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null) // 'delete' | 'reset' | null
  const [conflict, setConflict] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [toggling, setToggling] = useState(false)
  const [historyKey, setHistoryKey] = useState(0)
  const busyRef = useRef(false)
  const controllerRef = useRef(null)
  const mounted = useRef(true)
  const previousStatus = useRef(null) // { id, status } of the last lesson shown

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controllerRef.current?.abort()
    }
  }, [])

  const applyLesson = useCallback((l) => {
    const d = toDraft(l)
    setBase({ id: l.id, updatedAt: l.updated_at })
    setOriginal(d)
    setDraft(d)
  }, [])

  const fields = useMemo(() => changedFields(draft, original), [draft, original])
  const dirty = fields.length > 0
  // The server has a newer version than the one being edited
  const outdated = Boolean(lesson && base && base.id === lesson.id && base.updatedAt !== lesson.updated_at)

  // A loaded (or reloaded) lesson replaces the draft, unless it holds unsaved edits of
  // that lesson (e.g. a generation started meanwhile, or a save got a 409): they are
  // kept, still based on their version, so saving them goes through the conflict
  // dialog. A save response is merged by save() (base = saved version: nothing to do).
  useEffect(() => {
    if (!lesson) return
    if (base?.id === lesson.id && (dirty || !outdated)) return
    applyLesson(lesson)
  }, [lesson, base, dirty, outdated, applyLesson])

  const generating = lesson?.status === 'generating' && !lesson.stale
  const stuck = lesson?.status === 'generating' && Boolean(lesson.stale)
  const readOnly = generating

  // While generating: refresh until it ends, then say so
  useEffect(() => {
    if (!generating) return undefined
    const timer = setInterval(reload, POLL_MS)
    return () => clearInterval(timer)
  }, [generating, reload])

  useEffect(() => {
    if (!lesson) return
    const previous = previousStatus.current
    // Same lesson only: opening another lesson (back / forward) is not "the generation ended"
    if (previous?.id === lesson.id && previous.status === 'generating' && lesson.status !== 'generating') {
      if (lesson.status === 'published') toast.success('Génération terminée : la leçon est de nouveau modifiable.')
      else toast.error(lesson.error || 'La génération a échoué.')
    }
    previousStatus.current = { id: lesson.id, status: lesson.status }
  }, [lesson, toast])

  const storedExercises = lesson?.exercises
  const errors = useMemo(() => validateDraft(draft, { storedExercises }), [draft, storedExercises])
  // Errors of the changed fields; a stuck generation also needs a status with any save
  // (else it would stay 'generating' and look like a new generation)
  const blocking = useMemo(() => {
    const checked = stuck && fields.length && !fields.includes('status') ? [...fields, 'status'] : fields
    return checked.flatMap((f) => errorsFor(errors, f))
  }, [fields, errors, stuck])
  const bypassGuard = useUnsavedGuard(dirty)

  const sessions = useMemo(() => data?.sessions || [], [data])
  const reviewCount = data?.review_count || 0
  const hasResults = sessions.length > 0 || reviewCount > 0
  const currentResults = sessions.some((s) => s.current) || reviewCount > 0
  const resetsProgress =
    Boolean(draft && original) && fields.includes('exercises') && currentResults && exercisesResetProgress(draft.exercises, original.exercises)

  const patchDraft = useCallback((patch) => setDraft((d) => ({ ...d, ...patch })), [])

  const save = useCallback(
    async ({ overwrite = false } = {}) => {
      if (busyRef.current || !draft || !lesson || !base || fields.length === 0 || readOnly) return
      if (blocking.length > 0) {
        toast.error(`${blocking.length} problème${blocking.length > 1 ? 's' : ''} à corriger avant d'enregistrer.`)
        setTab(tabForError(blocking[0]))
        return
      }
      // Edits made on an older version: the server would answer 409 conflict
      if (outdated && !overwrite) {
        setConflict(true)
        return
      }
      busyRef.current = true
      setSaving(true)
      const sent = draft
      const controller = new AbortController()
      controllerRef.current = controller
      try {
        // Overwrite = apply my changed fields on top of the latest version
        let expectedUpdatedAt = base.updatedAt
        if (overwrite) {
          const fresh = await api(`/api/admin/lessons/${id}`, { signal: controller.signal })
          expectedUpdatedAt = fresh.lesson.updated_at
        }
        const res = await api(`/api/admin/lessons/${id}`, {
          method: 'PATCH',
          body: { ...buildPatch(sent, fields), expectedUpdatedAt },
          signal: controller.signal,
        })
        if (!mounted.current) return
        const saved = toDraft(res.lesson)
        setBase({ id: res.lesson.id, updatedAt: res.lesson.updated_at })
        setOriginal(saved)
        // Keeps what was typed while the request was in flight
        setDraft((current) => mergeAfterSave(current, sent, saved))
        // Edited exercises restart the progress: earlier sessions no longer count
        const reset = res.lesson.generated_at !== lesson.generated_at
        setData((prev) => ({
          ...prev,
          lesson: res.lesson,
          sessions: reset ? (prev.sessions || []).map((s) => ({ ...s, current: false })) : prev.sessions,
        }))
        setConflict(false)
        setHistoryKey((k) => k + 1)
        toast.success(
          reset && currentResults
            ? 'Leçon enregistrée. La progression de l’élève sur cette leçon repart de zéro.'
            : 'Leçon enregistrée.'
        )
      } catch (err) {
        if (isAbortError(err) || !mounted.current) return
        if (err.status === 409 && err.code === 'conflict') {
          setConflict(true)
          return
        }
        setConflict(false)
        const generationStarted = err.status === 409 && err.code === 'generating'
        toast.error(
          generationStarted
            ? `${err.message} Tes modifications sont conservées.`
            : err.message || "L'enregistrement a échoué."
        )
        // e.g. a generation started meanwhile: show the current state (read-only); the
        // unsaved edits stay (see the lesson effect)
        if (err.status === 409) reload()
      } finally {
        busyRef.current = false
        if (mounted.current) setSaving(false)
      }
    },
    [draft, lesson, base, outdated, fields, readOnly, blocking, currentResults, id, setData, reload, toast]
  )

  // « Recharger » in the conflict dialog: drops the edits, the latest version replaces them
  const reloadLatest = () => {
    setConflict(false)
    setDraft(original)
    reload()
  }

  // While generating: only the visibility can change (the server accepts it alone)
  const toggleHidden = async () => {
    if (busyRef.current || !lesson) return
    busyRef.current = true
    setToggling(true)
    const controller = new AbortController()
    controllerRef.current = controller
    try {
      const res = await api(`/api/admin/lessons/${id}`, {
        method: 'PATCH',
        body: { hidden: !lesson.hidden },
        signal: controller.signal,
      })
      if (!mounted.current) return
      setData((prev) => ({ ...prev, lesson: res.lesson }))
      setHistoryKey((k) => k + 1)
      toast.success(
        res.lesson.hidden
          ? 'Leçon passée en brouillon : l’élève ne la verra pas.'
          : 'Leçon publiée pour l’élève : il la verra dès qu’elle sera prête.'
      )
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      toast.error(err.message || 'La modification a échoué.')
      reload()
    } finally {
      busyRef.current = false
      if (mounted.current) setToggling(false)
    }
  }

  const remove = useCallback(async () => {
    if (busyRef.current) return
    busyRef.current = true
    setDeleting(true)
    const controller = new AbortController()
    controllerRef.current = controller
    try {
      await api(`/api/admin/lessons/${id}`, { method: 'DELETE', signal: controller.signal })
      if (!mounted.current) return
      bypassGuard.current = true
      toast.success('Leçon supprimée.')
      router.push('/admin/lessons')
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      toast.error(err.message || 'La suppression a échoué.')
      busyRef.current = false
      setDeleting(false)
      setConfirm(null)
    }
  }, [id, router, toast, bypassGuard])

  // Back to the latest version (the edits may have been made on an older one)
  const reset = () => {
    if (lesson) applyLesson(lesson)
    setConfirm(null)
    toast.success('Modifications annulées.')
  }

  const copy = useCallback(
    async (text, message) => {
      try {
        await navigator.clipboard.writeText(text)
        toast.success(message || 'Copié.')
      } catch {
        toast.error('Impossible de copier (autorisation refusée par le navigateur).')
      }
    },
    [toast]
  )

  // Ctrl/Cmd + S saves
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        save()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [save])

  const previewExercises = useMemo(
    () => (preview && draft ? stripKeys(draft.exercises).map((e, i) => ({ ...e, id: e.id || `new_${i}` })) : []),
    [preview, draft]
  )

  const ready = lesson && draft && original
  const title = lesson ? lessonTitle(lesson) : 'Leçon'

  const actions = (
    <>
      <Link href="/admin/lessons" className={cx(ui.btn, ui.small, admin.tap)}>
        <span aria-hidden="true">←</span> Leçons
      </Link>
      {ready && (
        <>
          <button
            type="button"
            className={cx(ui.btn, ui.small, admin.tap, admin.blueGhost)}
            aria-pressed={preview}
            onClick={() => setPreview((p) => !p)}
          >
            <span aria-hidden="true">👁️</span> {preview ? "Masquer l'aperçu" : "Voir comme l'élève"}
          </button>
          <button
            type="button"
            className={cx(ui.btn, ui.small, admin.tap, admin.redGhost)}
            onClick={() => setConfirm('delete')}
            disabled={deleting}
          >
            <span aria-hidden="true">🗑️</span> Supprimer
          </button>
        </>
      )}
    </>
  )

  let body
  if (router.isReady && !validId) {
    body = (
      <div className={cx(admin.section, admin.errorState)}>
        <span className={admin.stateIcon} aria-hidden="true">🤔</span>
        <p>Identifiant de leçon invalide.</p>
      </div>
    )
  } else if (error && !lesson) {
    body = (
      <div className={cx(admin.section, admin.errorState)} role="alert">
        <span className={admin.stateIcon} aria-hidden="true">😕</span>
        <p>{error}</p>
        <button type="button" className={cx(ui.btn, ui.small, admin.tap)} onClick={reload}>
          Réessayer
        </button>
      </div>
    )
  } else if (!ready) {
    body = (
      <div className={admin.stack} aria-busy="true" aria-label="Chargement de la leçon">
        <span className={cx(ui.skel, styles.skelHeader)} />
        <span className={cx(ui.skel, styles.skelBody)} />
        {loading && <span className="sr-only">Chargement…</span>}
      </div>
    )
  } else {
    const tabs = [
      { value: 'meta', label: 'Métadonnées', icon: '🏷️', errors: META_FIELDS.filter((f) => errors[f]).length, dirty: fields.some((f) => META_FIELDS.includes(f)) },
      { value: 'content', label: 'Contenu', icon: '📚', errors: errorsFor(errors, 'content').length, dirty: fields.includes('content') },
      { value: 'exercises', label: 'Exercices', icon: '🧩', count: draft.exercises.length, errors: errorsFor(errors, 'exercises').length, dirty: fields.includes('exercises') },
      { value: 'sources', label: 'Sources', icon: lesson.source_kind === 'import' ? '📄' : '🎙️' },
      { value: 'sessions', label: 'Sessions', icon: '🏋️', count: sessions.length },
      { value: 'history', label: 'Historique', icon: '🧾' },
    ]
    const panel = (
      <>
        {tab === 'meta' && (
          <MetadataTab draft={draft} lesson={lesson} errors={errors} onChange={patchDraft} onCopy={copy} hasResults={hasResults} />
        )}
        {tab === 'content' && <ContentTab content={draft.content} errors={errors} onChange={(content) => patchDraft({ content })} />}
        {tab === 'exercises' && (
          <ExercisesTab
            exercises={draft.exercises}
            errors={errors}
            resetsProgress={resetsProgress}
            onChange={(exercises) => patchDraft({ exercises })}
          />
        )}
        {tab === 'sources' && <SourcesTab lesson={lesson} onCopy={copy} />}
        {tab === 'sessions' && <SessionsTab sessions={sessions} reviewCount={reviewCount} />}
        {tab === 'history' && <HistorySection entity="lesson" entityId={lesson.id} refreshKey={historyKey} />}
      </>
    )
    body = (
      <div className={admin.stack}>
        {error && (
          <div className={admin.alert} role="alert">
            <span className={admin.alertText}>Actualisation impossible : {error}</span>
            <button type="button" className={cx(ui.btn, ui.small, admin.tap)} onClick={reload}>
              Réessayer
            </button>
          </div>
        )}
        <GenerationBanner
          lesson={lesson}
          onToggleHidden={toggleHidden}
          toggling={toggling}
          onChooseStatus={() => setTab('meta')}
        />
        {dirty && outdated && <KeptEditsNotice fields={fields} generating={generating} onDiscard={() => setConfirm('reset')} />}
        <LessonHeader lesson={lesson} />
        <div className={cx(styles.layout, preview && styles.withPreview)}>
          <div className={styles.editorCol}>
            <EditorTabs tabs={tabs} value={tab} onChange={setTab} idPrefix="lesson" />
            <div
              role="tabpanel"
              id={`lesson-panel-${tab}`}
              aria-labelledby={`lesson-tab-${tab}`}
              tabIndex={-1}
              className={styles.panel}
            >
              {EDITABLE_TABS.includes(tab) ? (
                <fieldset className={styles.locked} disabled={readOnly}>
                  {readOnly && <legend className="sr-only">Lecture seule pendant la génération</legend>}
                  {panel}
                </fieldset>
              ) : (
                panel
              )}
            </div>
          </div>
          {preview && (
            <aside className={styles.previewCol} aria-label="Aperçu élève (brouillon)">
              <div className={styles.previewHead}>
                <strong>Aperçu élève</strong>
                <span className={admin.sectionSub}>Brouillon non enregistré inclus</span>
                <button
                  type="button"
                  className={cx(ui.btn, ui.small, admin.tap, styles.previewClose)}
                  onClick={() => setPreview(false)}
                >
                  Retour à l&apos;édition
                </button>
              </div>
              <LessonView content={stripKeys(draft.content)} />
              <h2 className={cx(admin.sectionTitle, styles.previewSub)}>
                <span aria-hidden="true">🧩</span> Exercices (vue prof)
              </h2>
              <ExerciseReview exercises={previewExercises} />
            </aside>
          )}
        </div>
        {!readOnly && (
          <SaveBar
            fields={fields}
            errorCount={blocking.length}
            saving={saving}
            resetsProgress={resetsProgress}
            onSave={() => save()}
            onReset={() => setConfirm('reset')}
          />
        )}
      </div>
    )
  }

  return (
    <AdminShell title={title} actions={actions}>
      {body}
      <ConfirmDialog
        open={confirm === 'delete'}
        title="Supprimer cette leçon ?"
        message={`« ${title} » sera supprimée définitivement (l'élève ne la verra plus, ses résultats sur cette leçon aussi). Cette action est irréversible.`}
        confirmLabel="Supprimer"
        tone="danger"
        busy={deleting}
        onConfirm={remove}
        onCancel={() => !deleting && setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === 'reset'}
        title="Annuler les modifications ?"
        message="Toutes les modifications non enregistrées seront perdues."
        confirmLabel="Tout annuler"
        tone="danger"
        busy={false}
        onConfirm={reset}
        onCancel={() => setConfirm(null)}
      />
      <Modal
        open={conflict}
        title="Cette leçon a été modifiée ailleurs"
        icon="🔀"
        tone="danger"
        onClose={() => setConflict(false)}
        busy={saving}
        actions={
          <>
            <button type="button" className={cx(ui.btn, admin.tap)} onClick={() => setConflict(false)} disabled={saving}>
              Annuler
            </button>
            <button type="button" className={cx(ui.btn, ui.blue, admin.tap)} onClick={reloadLatest} disabled={saving}>
              Recharger
            </button>
            <button
              type="button"
              className={cx(ui.btn, ui.red, admin.tap)}
              onClick={() => save({ overwrite: true })}
              disabled={saving}
              aria-busy={saving || undefined}
            >
              {saving && <span className={admin.spinner} aria-hidden="true" />}
              Écraser avec mes modifications
            </button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          Depuis que tu l’as ouverte, la leçon a changé (espace prof, régénération ou autre onglet).
        </p>
        <ul style={{ margin: 0, paddingLeft: '1.2rem' }}>
          <li>
            <strong>Recharger</strong> : affiche la dernière version, tes modifications sont perdues.
          </li>
          <li>
            <strong>Écraser</strong> : enregistre tes modifications ({fields.length} champ{fields.length > 1 ? 's' : ''}) par-dessus la
            dernière version.
          </li>
        </ul>
      </Modal>
      <ToastViewport />
    </AdminShell>
  )
}
