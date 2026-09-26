import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import AdminShell from '@/components/admin/AdminShell'
import ConfirmDialog from '@/components/admin/common/ConfirmDialog'
import { useToast, ToastViewport } from '@/components/admin/common/Toast'
import useAdminQuery from '@/components/admin/common/useAdminQuery'
import { cx, isAbortError, isValidId } from '@/components/admin/common/format'
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
import useUnsavedGuard from '@/components/admin/lessons/useUnsavedGuard'
import { lessonTitle } from '@/components/admin/lessons/constants'
import {
  buildPatch,
  changedFields,
  errorsFor,
  stripKeys,
  toDraft,
  validateDraft,
} from '@/components/admin/lessons/editorModel'
import { api } from '@/utils/apiClient'
import admin from '@/components/admin/common/admin.module.css'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/admin/lessons/editor.module.css'

const META_FIELDS = ['title', 'lessonDate', 'status', 'studentId', 'driveUrl']

function tabForError(path) {
  if (path.startsWith('content')) return 'content'
  if (path.startsWith('exercises')) return 'exercises'
  return 'meta'
}

export default function AdminLessonEditorPage() {
  const router = useRouter()
  const toast = useToast()
  const id = router.isReady ? router.query.id : undefined
  const validId = isValidId(id)

  const { data, error, loading, reload, setData } = useAdminQuery(validId ? `/api/admin/lessons/${id}` : null)
  const lesson = data?.lesson && data.lesson.id === id ? data.lesson : null

  const [original, setOriginal] = useState(null)
  const [draft, setDraft] = useState(null)
  const [tab, setTab] = useState('meta')
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [confirm, setConfirm] = useState(null) // 'delete' | 'reset' | null
  const [deleting, setDeleting] = useState(false)
  const busyRef = useRef(false)
  const controllerRef = useRef(null)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controllerRef.current?.abort()
    }
  }, [])

  // Server value (load or save response) replaces the draft
  useEffect(() => {
    if (!lesson) return
    const d = toDraft(lesson)
    setOriginal(d)
    setDraft(d)
  }, [lesson])

  const fields = useMemo(() => changedFields(draft, original), [draft, original])
  const dirty = fields.length > 0
  const errors = useMemo(() => validateDraft(draft), [draft])
  const blocking = useMemo(() => fields.flatMap((f) => errorsFor(errors, f)), [fields, errors])
  const bypassGuard = useUnsavedGuard(dirty)

  const patchDraft = useCallback((patch) => setDraft((d) => ({ ...d, ...patch })), [])

  const save = useCallback(async () => {
    if (busyRef.current || !draft || fields.length === 0) return
    if (blocking.length > 0) {
      toast.error(`${blocking.length} problème${blocking.length > 1 ? 's' : ''} à corriger avant d'enregistrer.`)
      setTab(tabForError(blocking[0]))
      return
    }
    busyRef.current = true
    setSaving(true)
    const controller = new AbortController()
    controllerRef.current = controller
    try {
      const res = await api(`/api/admin/lessons/${id}`, {
        method: 'PATCH',
        body: buildPatch(draft, fields),
        signal: controller.signal,
      })
      if (!mounted.current) return
      setData((prev) => ({ ...prev, lesson: res.lesson }))
      toast.success('Leçon enregistrée.')
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      toast.error(err.message || "L'enregistrement a échoué.")
    } finally {
      busyRef.current = false
      if (mounted.current) setSaving(false)
    }
  }, [draft, fields, blocking, id, setData, toast])

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

  const reset = () => {
    setDraft(original)
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
      { value: 'sources', label: 'Sources', icon: '🎙️' },
      { value: 'sessions', label: 'Sessions', icon: '🏋️', count: data.sessions?.length || 0 },
    ]
    body = (
      <div className={admin.stack}>
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
              {tab === 'meta' && (
                <MetadataTab draft={draft} lesson={lesson} errors={errors} onChange={patchDraft} onCopy={copy} />
              )}
              {tab === 'content' && (
                <ContentTab content={draft.content} errors={errors} onChange={(content) => patchDraft({ content })} />
              )}
              {tab === 'exercises' && (
                <ExercisesTab
                  exercises={draft.exercises}
                  errors={errors}
                  onChange={(exercises) => patchDraft({ exercises })}
                />
              )}
              {tab === 'sources' && <SourcesTab lesson={lesson} onCopy={copy} />}
              {tab === 'sessions' && <SessionsTab sessions={data.sessions} />}
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
        <SaveBar fields={fields} errorCount={blocking.length} saving={saving} onSave={save} onReset={() => setConfirm('reset')} />
      </div>
    )
  }

  return (
    <AdminShell title={title} actions={actions}>
      {body}
      <ConfirmDialog
        open={confirm === 'delete'}
        title="Supprimer cette leçon ?"
        message={`« ${title} » sera supprimée définitivement (l'élève ne la verra plus). Cette action est irréversible.`}
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
        tone="primary"
        busy={false}
        onConfirm={reset}
        onCancel={() => setConfirm(null)}
      />
      <ToastViewport />
    </AdminShell>
  )
}
