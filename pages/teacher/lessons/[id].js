import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import AppShell from '@/components/AppShell'
import LessonView from '@/components/lesson/LessonView'
import { api } from '@/utils/apiClient'
import ConfirmDialog from '@/components/teacher/ConfirmDialog'
import DriveLinkEditor from '@/components/teacher/DriveLinkEditor'
import ExerciseReview from '@/components/teacher/ExerciseReview'
import GenerationProgress from '@/components/teacher/GenerationProgress'
import LessonResults from '@/components/teacher/LessonResults'
import LessonSources from '@/components/teacher/LessonSources'
import PageState from '@/components/teacher/PageState'
import Skeleton from '@/components/teacher/Skeleton'
import StatusBadge from '@/components/teacher/StatusBadge'
import Tabs from '@/components/teacher/Tabs'
import { formatLessonDate, isAbortError, isValidId } from '@/components/teacher/format'
import { useBeforeUnload, useMountedRef } from '@/components/teacher/hooks'
import shared from '@/components/teacher/Teacher.module.css'
import styles from '@/components/teacher/LessonPage.module.css'

const POLL_MS = 4000
const POLL_RETRY_MS = 8000
const STALE_GENERATION_MS = 5 * 60 * 1000

function lessonTitle(lesson) {
  return lesson?.title?.trim() || lesson?.content?.title?.trim() || 'Leçon sans titre'
}

export default function TeacherLessonPage() {
  const router = useRouter()
  const mounted = useMountedRef()
  const id = router.isReady ? router.query.id : undefined
  const validId = isValidId(id)

  const [data, setData] = useState(null) // { lesson, sessions }
  const [loadError, setLoadError] = useState(null)
  const [notFound, setNotFound] = useState(false)
  const loadController = useRef(null)

  const [tab, setTab] = useState('recap')
  const [confirm, setConfirm] = useState(null) // 'regenerate' | 'delete' | null
  const [actionError, setActionError] = useState(null)
  const [notice, setNotice] = useState(null)

  const [regenerating, setRegenerating] = useState(false)
  const [regenStartedAt, setRegenStartedAt] = useState(null)
  const regenRef = useRef(false)
  const regenController = useRef(null)

  const [deleting, setDeleting] = useState(false)
  const deleteController = useRef(null)

  // Exercises removed locally (pending or confirmed); rolled back on error
  const [hiddenIds, setHiddenIds] = useState(() => new Set())
  const [removingIds, setRemovingIds] = useState(() => new Set())
  const [exerciseError, setExerciseError] = useState(null)
  const exerciseControllers = useRef(new Set())
  const patchController = useRef(null)

  useBeforeUnload(regenerating)

  // Abort everything on unmount
  useEffect(
    () => () => {
      loadController.current?.abort()
      regenController.current?.abort()
      deleteController.current?.abort()
      patchController.current?.abort()
      exerciseControllers.current.forEach((c) => c.abort())
    },
    []
  )

  const load = useCallback(async () => {
    if (!validId) return
    loadController.current?.abort()
    const controller = new AbortController()
    loadController.current = controller
    setLoadError(null)
    setNotFound(false)
    setData(null)
    try {
      const res = await api(`/api/teacher/lessons/${id}`, { signal: controller.signal })
      if (!mounted.current || controller.signal.aborted) return
      setData({ lesson: res.lesson, sessions: res.sessions || [] })
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      if (err.status === 404) setNotFound(true)
      else setLoadError(err.message || 'Impossible de charger la leçon.')
    }
  }, [id, validId, mounted])

  useEffect(() => {
    load()
  }, [load])

  // Reset per-lesson UI state when navigating between lessons
  useEffect(() => {
    setTab('recap')
    setHiddenIds(new Set())
    setActionError(null)
    setExerciseError(null)
    setNotice(null)
  }, [id])

  const lesson = data?.lesson
  const status = lesson?.status

  // ---- Poll while the lesson is generating (started elsewhere or before we loaded) ----
  useEffect(() => {
    if (status !== 'generating' || regenerating || !validId) return undefined
    const controller = new AbortController()
    let timer = null
    const tick = async () => {
      try {
        const res = await api(`/api/teacher/lessons/${id}`, { signal: controller.signal })
        if (controller.signal.aborted || !mounted.current) return
        if (res.lesson?.status !== 'generating') setHiddenIds(new Set())
        setData({ lesson: res.lesson, sessions: res.sessions || [] })
        if (res.lesson?.status === 'generating') timer = setTimeout(tick, POLL_MS)
      } catch (err) {
        if (isAbortError(err) || controller.signal.aborted || !mounted.current) return
        if (err.status === 404) {
          setNotFound(true)
          return
        }
        timer = setTimeout(tick, POLL_RETRY_MS)
      }
    }
    timer = setTimeout(tick, POLL_MS)
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [status, regenerating, id, validId, mounted])

  // Auto-hide success notices
  useEffect(() => {
    if (!notice) return undefined
    const t = setTimeout(() => setNotice(null), 5000)
    return () => clearTimeout(t)
  }, [notice])

  // ---- Actions ----
  const refreshSilently = useCallback(
    async (signal) => {
      const res = await api(`/api/teacher/lessons/${id}`, { signal })
      if (!mounted.current || signal?.aborted) return null
      setData({ lesson: res.lesson, sessions: res.sessions || [] })
      return res.lesson
    },
    [id, mounted]
  )

  const handleRegenerate = async () => {
    setConfirm(null)
    if (regenRef.current || !lesson) return
    regenRef.current = true
    regenController.current?.abort()
    const controller = new AbortController()
    regenController.current = controller
    setActionError(null)
    setNotice(null)
    setRegenStartedAt(Date.now())
    setRegenerating(true)
    setData((prev) => (prev ? { ...prev, lesson: { ...prev.lesson, status: 'generating', error: null } } : prev))
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })

    try {
      await api(`/api/teacher/lessons/${id}/regenerate`, { method: 'POST', body: {}, signal: controller.signal })
      if (!mounted.current) return
      setHiddenIds(new Set())
      const fresh = await refreshSilently(controller.signal)
      if (!fresh) return
      if (fresh.status === 'published') {
        setTab('recap')
        setNotice('Leçon régénérée et publiée ✓')
      }
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      const code = err?.status || 0
      if (code === 409) {
        setActionError('Une génération est déjà en cours pour cette leçon. La page se mettra à jour automatiquement.')
      } else if (code === 0 || code >= 500) {
        setActionError(
          `${err.message || 'Erreur réseau.'} La génération continue peut-être sur le serveur : la page se mettra à jour automatiquement.`
        )
      } else {
        setActionError(err.message || 'La régénération a échoué.')
        refreshSilently(controller.signal).catch(() => {})
      }
    } finally {
      regenRef.current = false
      if (mounted.current) setRegenerating(false)
    }
  }

  const handleDelete = async () => {
    if (deleting) return
    deleteController.current?.abort()
    const controller = new AbortController()
    deleteController.current = controller
    setDeleting(true)
    setActionError(null)
    try {
      await api(`/api/teacher/lessons/${id}`, { method: 'DELETE', signal: controller.signal })
      if (!mounted.current) return
      router.replace(lesson?.student_id ? `/teacher/students/${lesson.student_id}` : '/teacher')
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      setActionError(err.message || 'La suppression a échoué.')
      setConfirm(null)
      setDeleting(false)
    }
  }

  const handleDriveSave = async (url) => {
    patchController.current?.abort()
    const controller = new AbortController()
    patchController.current = controller
    const res = await api(`/api/teacher/lessons/${id}`, {
      method: 'PATCH',
      body: { driveUrl: url },
      signal: controller.signal,
    })
    if (!mounted.current) return
    setData((prev) =>
      prev ? { ...prev, lesson: res?.lesson ? res.lesson : { ...prev.lesson, drive_url: url } } : prev
    )
  }

  const handleRemoveExercise = async (exerciseId) => {
    if (removingIds.has(exerciseId)) return
    setExerciseError(null)
    // Optimistic: hide right away
    setHiddenIds((prev) => new Set(prev).add(exerciseId))
    setRemovingIds((prev) => new Set(prev).add(exerciseId))
    const controller = new AbortController()
    exerciseControllers.current.add(controller)
    try {
      const res = await api(`/api/teacher/lessons/${id}`, {
        method: 'PATCH',
        body: { removeExerciseIds: [exerciseId] },
        signal: controller.signal,
      })
      if (!mounted.current) return
      if (res?.lesson) setData((prev) => (prev ? { ...prev, lesson: res.lesson } : prev))
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      // Rollback: the exercise reappears at its original place
      setHiddenIds((prev) => {
        const next = new Set(prev)
        next.delete(exerciseId)
        return next
      })
      setExerciseError(err.message || "L'exercice n'a pas pu être supprimé.")
    } finally {
      exerciseControllers.current.delete(controller)
      if (mounted.current) {
        setRemovingIds((prev) => {
          const next = new Set(prev)
          next.delete(exerciseId)
          return next
        })
      }
    }
  }

  // ---- Derived ----
  const invalid = router.isReady && !validId
  const loading = !invalid && !data && !loadError && !notFound
  const exercises = (Array.isArray(lesson?.exercises) ? lesson.exercises : []).filter((e) => !hiddenIds.has(e.id))
  const sessions = data?.sessions || []
  const isGenerating = status === 'generating'
  const updatedAtMs = lesson?.updated_at ? Date.parse(lesson.updated_at) : NaN
  const staleGeneration =
    isGenerating && !regenerating && Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs > STALE_GENERATION_MS
  // Stable start time for the progress timer when the generation was started elsewhere
  const observedStart = useMemo(
    () => (Number.isFinite(updatedAtMs) ? Math.min(updatedAtMs, Date.now()) : Date.now()),
    [lesson?.id, updatedAtMs, isGenerating]
  )
  const canRegenerate = Boolean(lesson) && !regenerating && !deleting && (!isGenerating || staleGeneration)
  const studentHref = lesson?.student_id ? `/teacher/students/${lesson.student_id}` : '/teacher'
  const title = lesson ? lessonTitle(lesson) : invalid || notFound ? 'Leçon introuvable' : 'Leçon'

  const tabs = [
    { key: 'recap', label: 'Bilan' },
    { key: 'exercises', label: `Exercices (${exercises.length})` },
    { key: 'results', label: `Résultats (${sessions.length})` },
    { key: 'sources', label: 'Sources' },
  ]

  let body
  if (invalid || notFound) {
    body = (
      <PageState
        icon="🔍"
        title="Leçon introuvable"
        text="Cette leçon n'existe pas ou a été supprimée."
        link={{ href: '/teacher', label: 'Retour à mes élèves' }}
      />
    )
  } else if (loadError) {
    body = <PageState role="alert" title="Impossible de charger la leçon" text={loadError} onRetry={load} />
  } else if (loading) {
    body = (
      <div className={shared.stack} aria-hidden="true">
        <div className={styles.metaCard}>
          <Skeleton width="50%" height={16} />
          <Skeleton width="35%" height={14} style={{ marginTop: 10 }} />
        </div>
        <div className={styles.tabsCard}>
          <Skeleton width="60%" height={36} radius={8} />
          <div className={styles.panel}>
            <Skeleton width="90%" height={14} />
            <Skeleton width="80%" height={14} style={{ marginTop: 10 }} />
            <Skeleton width="85%" height={14} style={{ marginTop: 10 }} />
            <Skeleton width="40%" height={14} style={{ marginTop: 10 }} />
            <Skeleton height={120} style={{ marginTop: 20 }} radius={10} />
          </div>
        </div>
      </div>
    )
  } else {
    body = (
      <div className={shared.stack}>
        <section className={styles.metaCard} aria-label="Informations">
          <div className={styles.metaRow}>
            <StatusBadge status={status} />
            <span className={styles.metaItem}>
              <span aria-hidden="true">👤 </span>
              {lesson.student_id ? (
                <Link href={studentHref} className={styles.studentLink}>
                  {lesson.student_name || 'Élève'}
                </Link>
              ) : (
                lesson.student_name || 'Élève supprimé'
              )}
            </span>
            <span className={styles.metaItem}>
              <span aria-hidden="true">📅 </span>
              {formatLessonDate(lesson.lesson_date, { long: true })}
            </span>
          </div>
          <div className={styles.driveRow}>
            <DriveLinkEditor
              key={lesson.id}
              value={lesson.drive_url || ''}
              onSave={handleDriveSave}
              disabled={regenerating || deleting}
            />
          </div>
        </section>

        {notice && (
          <div className="alert alert-success" role="status">
            {notice}
          </div>
        )}

        {actionError && (
          <div className={`alert alert-error ${shared.inlineAlert}`} role="alert">
            <span>⚠️ {actionError}</span>
          </div>
        )}

        {isGenerating && (
          <GenerationProgress
            startedAt={regenerating ? regenStartedAt : observedStart}
            heading={regenerating ? 'Régénération de la leçon…' : 'Génération en cours…'}
            note={
              staleGeneration ? (
                <div className={`alert ${shared.alertWarning} ${styles.staleAlert}`}>
                  <span>La génération semble bloquée depuis plus de 5 minutes.</span>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => setConfirm('regenerate')}>
                    🔄 Relancer
                  </button>
                </div>
              ) : !regenerating ? (
                'La page se met à jour automatiquement.'
              ) : null
            }
          />
        )}

        {status === 'failed' && (
          <section className={styles.failed} role="alert" aria-labelledby="lesson-failed-title">
            <div className={styles.failedIcon} aria-hidden="true">⚠️</div>
            <div className={styles.failedBody}>
              <h2 id="lesson-failed-title" className={styles.failedTitle}>La génération a échoué</h2>
              <p className={styles.failedError}>{lesson.error || 'Erreur inconnue.'}</p>
              <p className={styles.failedText}>
                La transcription et les notes sont conservées : relance la génération quand tu veux.
              </p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setConfirm('regenerate')}
                disabled={!canRegenerate}
              >
                🔄 Régénérer
              </button>
            </div>
          </section>
        )}

        {status === 'published' && (
          <section className={styles.tabsCard}>
            <Tabs tabs={tabs} active={tab} onChange={setTab} idPrefix="lesson" label="Contenu de la leçon" />
            <div
              role="tabpanel"
              id={`lesson-panel-${tab}`}
              aria-labelledby={`lesson-tab-${tab}`}
              tabIndex={0}
              className={styles.panel}
            >
              {tab === 'recap' &&
                (lesson.content ? (
                  <LessonView content={lesson.content} />
                ) : (
                  <p className={shared.muted}>Aucun bilan pour cette leçon.</p>
                ))}
              {tab === 'exercises' && (
                <>
                  {exerciseError && (
                    <div className={`alert alert-error ${shared.inlineAlert} ${styles.panelAlert}`} role="alert">
                      ⚠️ {exerciseError}
                    </div>
                  )}
                  <p className={styles.panelIntro}>
                    Les bonnes réponses sont surlignées. Supprime un exercice s&apos;il n&apos;est pas pertinent :
                    il disparaîtra aussi chez l&apos;élève.
                  </p>
                  <ExerciseReview
                    exercises={exercises}
                    onRemove={handleRemoveExercise}
                    removingIds={removingIds}
                    disabled={regenerating || deleting}
                  />
                </>
              )}
              {tab === 'results' && <LessonResults sessions={sessions} />}
              {tab === 'sources' && (
                <LessonSources transcript={lesson.transcript} canva={lesson.canva} aiModel={lesson.ai_model} />
              )}
            </div>
          </section>
        )}

        {status !== 'published' && (
          <section className="dashboard-section" aria-labelledby="lesson-sources-title">
            <div className="dashboard-section-header">
              <h2 id="lesson-sources-title" className="dashboard-section-title">📄 Sources</h2>
            </div>
            <div className="dashboard-section-body">
              <LessonSources transcript={lesson.transcript} canva={lesson.canva} aiModel={lesson.ai_model} />
            </div>
          </section>
        )}
      </div>
    )
  }

  const showActions = Boolean(lesson) && !invalid && !notFound

  return (
    <div className={shared.page}>
      <Head>
        <title>{`${title} — Preply Lessons`}</title>
      </Head>
      <AppShell
        title={title}
        back={
          lesson?.student_id
            ? { href: studentHref, label: lesson.student_name || "Fiche de l'élève" }
            : { href: '/teacher', label: 'Mes élèves' }
        }
        actions={
          showActions ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirm('regenerate')}
                disabled={!canRegenerate}
              >
                {regenerating ? (
                  <>
                    <span className={`spinner ${styles.btnSpinner}`} aria-hidden="true" /> Régénération…
                  </>
                ) : (
                  '🔄 Régénérer'
                )}
              </button>
              <button
                type="button"
                className={`btn btn-ghost ${styles.deleteButton}`}
                onClick={() => setConfirm('delete')}
                disabled={regenerating || deleting}
              >
                🗑️ Supprimer
              </button>
            </>
          ) : undefined
        }
      >
        {loading && <span className="sr-only" role="status">Chargement de la leçon…</span>}
        {body}

        <ConfirmDialog
          open={confirm === 'regenerate'}
          title="Régénérer la leçon ?"
          message={
            status === 'published'
              ? "Le bilan et les exercices actuels seront remplacés par une nouvelle version, à partir de la même transcription et des mêmes notes. L'élève verra la nouvelle version."
              : 'La génération va être relancée à partir de la transcription et des notes enregistrées.'
          }
          confirmLabel="Régénérer"
          onConfirm={handleRegenerate}
          onCancel={() => setConfirm(null)}
        />
        <ConfirmDialog
          open={confirm === 'delete'}
          title="Supprimer la leçon ?"
          message="La leçon, ses exercices et les résultats de l'élève seront définitivement supprimés."
          confirmLabel={deleting ? 'Suppression…' : 'Supprimer'}
          danger
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirm(null)}
        />
      </AppShell>
    </div>
  )
}
