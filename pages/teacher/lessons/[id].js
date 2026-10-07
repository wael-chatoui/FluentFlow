import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import Head from 'next/head'
import { useRouter } from 'next/router'
import LessonView from '@/components/lesson/LessonView'
import LoadingScreen from '@/components/ui/LoadingScreen'
import { api } from '@/utils/apiClient'
import ConfirmDialog from '@/components/teacher/ConfirmDialog'
import LessonResults from '@/components/teacher/LessonResults'
import LessonSources from '@/components/teacher/LessonSources'
import PageState from '@/components/teacher/PageState'
import Tabs from '@/components/teacher/Tabs'
import TeacherShell from '@/components/teacher/TeacherShell'
import BackLink from '@/components/teacher/lessons/BackLink'
import ExercisesPanel from '@/components/teacher/lessons/ExercisesPanel'
import { FailedPanel, GeneratingPanel, RegenErrorBanner } from '@/components/teacher/lessons/GenerationPanels'
import LessonHeader from '@/components/teacher/lessons/LessonHeader'
import PreviewLayer from '@/components/teacher/lessons/PreviewLayer'
import RegeneratePanel from '@/components/teacher/lessons/RegeneratePanel'
import UndoToast from '@/components/teacher/lessons/UndoToast'
import useExerciseRemoval, { UNDO_MS } from '@/components/teacher/lessons/useExerciseRemoval'
import useLesson from '@/components/teacher/lessons/useLesson'
import { isAbortError, isStaleGeneration, isValidId, lessonTitle, plural } from '@/components/teacher/format'
import { useMountedRef } from '@/components/teacher/hooks'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/LessonPage.module.css'
import { CircleAlert, CircleCheck, Eye, EyeOff, FileText, SearchX } from 'lucide-react'
import Icon from '@/components/ui/Icon'

// The player is big and client-only (it shuffles in state initializers): loaded on demand,
// fetched ahead when the pointer or the focus reaches « Tester les exercices »
const PracticePlayer = dynamic(() => import('@/components/practice/PracticePlayer'), {
  ssr: false,
  loading: () => <LoadingScreen label="Chargement des exercices…" />,
})
const preloadPlayer = () => {
  import('@/components/practice/PracticePlayer').catch(() => {})
}

const TAB_KEYS = ['recap', 'exercises', 'results', 'sources']

function LessonSkeleton() {
  return (
    <div className={styles.stack} aria-hidden="true">
      <div className={`${styles.header} ${styles.headerSkeleton}`}>
        <div className={styles.headTop}>
          <span className={`${ui.skel} ${styles.tileSkel}`} />
          <div className={styles.headText}>
            <span className={ui.skel} style={{ width: '45%', height: 12 }} />
            <span className={ui.skel} style={{ width: '85%', height: 28, marginTop: 10 }} />
          </div>
        </div>
        <span className={ui.skel} style={{ width: '60%', height: 32 }} />
        <span className={ui.skel} style={{ height: 48, borderRadius: 16 }} />
      </div>
      <span className={ui.skel} style={{ height: 52, borderRadius: 16 }} />
      <span className={ui.skel} style={{ height: 220, borderRadius: 20 }} />
    </div>
  )
}

function Alert({ tone, icon, children, role = 'status' }) {
  return (
    <div className={`${bits.alert} ${bits[tone]}`} role={role}>
      <span className={bits.alertIcon} aria-hidden="true">
        <Icon icon={icon} size={20} />
      </span>
      <span className={bits.alertBody}>{children}</span>
    </div>
  )
}

/** Everything for one lesson id (remounted when the id changes, so no state leaks between lessons). */
function LessonScreen({ id, initialTab, duplicate }) {
  const router = useRouter()
  const mounted = useMountedRef()
  const { lesson, sessions, olderCount, loading, error, notFound, reload, refresh, applyLesson } = useLesson(id)

  const [tab, setTab] = useState(initialTab)
  const [notice, setNotice] = useState(duplicate ? 'Cette leçon avait déjà été créée avec ce brouillon : la voici (pas de doublon).' : null)
  const [actionError, setActionError] = useState(null)
  const [editingSources, setEditingSources] = useState(false)
  const [regenBusy, setRegenBusy] = useState(false)
  const [regenError, setRegenError] = useState(null)
  const [publishing, setPublishing] = useState(false)
  const [confirm, setConfirm] = useState(null) // 'delete' | 'unpublish' | null
  const [deleting, setDeleting] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [dismissedError, setDismissedError] = useState(null)
  const [exerciseError, setExerciseError] = useState(null)
  // One progress panel per generation run launched from here (its timer start is kept for the run)
  const [generationRun, setGenerationRun] = useState(0)
  const testRef = useRef(null)
  const prevStatus = useRef(null)

  const removal = useExerciseRemoval(id, {
    onCommitted: applyLesson,
    onError: (message) => setExerciseError(message),
  })

  const status = lesson?.status
  const stale = isStaleGeneration(lesson)

  // Announce the end of a generation seen by the polling
  useEffect(() => {
    if (!lesson) return
    // A new generation: its own failure must show even if an older one was dismissed
    if (status === 'generating' && prevStatus.current !== 'generating') setDismissedError(null)
    if (prevStatus.current === 'generating' && status === 'published' && !lesson.error) {
      setTab('recap')
      setNotice(
        lesson.hidden
          ? "Leçon prête. Elle est encore invisible pour l'élève : relis-la puis publie-la."
          : "Leçon prête et publiée pour l'élève."
      )
    }
    prevStatus.current = status
  }, [lesson, status])

  // Success notices fade out; errors stay until the next action
  useEffect(() => {
    if (!notice) return undefined
    const t = setTimeout(() => setNotice(null), 6000)
    return () => clearTimeout(t)
  }, [notice])

  const patch = useCallback(
    async (body) => {
      const res = await api(`/api/teacher/lessons/${id}`, { method: 'PATCH', body })
      if (mounted.current && res?.lesson) applyLesson(res.lesson)
      return res?.lesson
    },
    [id, applyLesson, mounted]
  )

  const regenerate = async (body = {}) => {
    if (regenBusy) return
    setRegenBusy(true)
    setRegenError(null)
    setActionError(null)
    setNotice(null)
    try {
      await api(`/api/teacher/lessons/${id}/regenerate`, { method: 'POST', body })
      if (!mounted.current) return
      // 202: the AI runs in the background; the polling takes over from here.
      // updated_at is unknown until the refresh (the old one would start the timer days ago)
      applyLesson({ status: 'generating', error: null, stale: false, updated_at: null })
      setGenerationRun((n) => n + 1)
      setEditingSources(false)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      refresh()
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      const code = err.status || 0
      if (code === 409) {
        setEditingSources(false)
        setActionError('Une génération est déjà en cours pour cette leçon : la page se met à jour toute seule.')
        refresh()
      } else if (code === 0 || code >= 500) {
        setActionError(`${err.message} La génération a peut-être démarré : la page va se mettre à jour.`)
        refresh()
      } else if (editingSources) {
        setRegenError(err.message)
      } else {
        setActionError(err.message)
      }
    } finally {
      if (mounted.current) setRegenBusy(false)
    }
  }

  const setHidden = async (hidden) => {
    setConfirm(null)
    setPublishing(true)
    setActionError(null)
    try {
      await patch({ hidden })
      if (mounted.current) {
        setNotice(hidden ? "Leçon retirée de l'espace élève." : "Leçon publiée : l'élève la voit maintenant.")
        // The button that was used is replaced by its opposite: land on the next action
        requestAnimationFrame(() => testRef.current?.focus())
      }
    } catch (err) {
      if (!isAbortError(err) && mounted.current) setActionError(err.message || 'La modification a échoué.')
    } finally {
      if (mounted.current) setPublishing(false)
    }
  }

  const notifyStudent = async () => {
    setActionError(null)
    try {
      await patch({ notifyStudent: true })
      if (mounted.current) setNotice("E-mail de notification envoyé à l’élève.")
    } catch (err) {
      if (!isAbortError(err) && mounted.current) setActionError(err.message || "L’envoi de l’e-mail a échoué.")
    }
  }

  const handleDelete = async () => {
    if (deleting) return
    removal.undo()
    setDeleting(true)
    setActionError(null)
    try {
      await api(`/api/teacher/lessons/${id}`, { method: 'DELETE' })
      if (!mounted.current) return
      router.replace(lesson?.student_id ? `/teacher/students/${lesson.student_id}` : '/teacher')
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      setActionError(err.message || 'La suppression a échoué.')
      setConfirm(null)
      setDeleting(false)
    }
  }

  // « Ignorer » the failed-regeneration warning: cleared server-side too, so it also
  // leaves the dashboard's « À traiter » list and does not come back on reload
  const dismissRegenError = async () => {
    setDismissedError(lesson?.error || null)
    requestAnimationFrame(() => document.querySelector('[data-lesson-action="regenerate"]')?.focus())
    try {
      await patch({ dismissError: true })
      if (mounted.current) refresh()
    } catch (err) {
      if (!isAbortError(err) && mounted.current) {
        setActionError(err.message || "L'avertissement n'a pas pu être masqué : il réapparaîtra au prochain chargement.")
      }
    }
  }

  const openSourcesEditor = () => {
    setRegenError(null)
    setEditingSources(true)
  }

  const closeSourcesEditor = () => {
    setEditingSources(false)
    requestAnimationFrame(() => document.querySelector('[data-lesson-action="regenerate"]')?.focus())
  }

  const closePreview = () => {
    setPreviewOpen(false)
    requestAnimationFrame(() => testRef.current?.focus())
  }

  // ---- Render ----
  const backLink = lesson?.student_id
    ? { href: `/teacher/students/${lesson.student_id}`, label: lesson.student_name || "Fiche de l'élève" }
    : { href: '/teacher', label: 'Mes élèves' }
  const title = lesson ? lessonTitle(lesson) : notFound ? 'Leçon introuvable' : 'Leçon'

  let body
  if (notFound) {
    body = (
      <PageState
        icon={SearchX}
        headingLevel={1}
        title="Leçon introuvable"
        text="Cette leçon n'existe pas ou a été supprimée."
        link={{ href: '/teacher', label: 'Retour à mes élèves' }}
      />
    )
  } else if (error) {
    body = <PageState role="alert" headingLevel={1} title="Impossible de charger la leçon" text={error} onRetry={reload} />
  } else if (loading || !lesson) {
    body = (
      <>
        <h1 className="sr-only">Leçon</h1>
        <span className="sr-only" role="status">
          Chargement de la leçon…
        </span>
        <LessonSkeleton />
      </>
    )
  } else {
    const hasContent = Boolean(lesson.content)
    const generating = status === 'generating'
    const exercises = (Array.isArray(lesson.exercises) ? lesson.exercises : []).filter((e) => !removal.hiddenIds.has(e.id))
    const busy = regenBusy || deleting
    const tabs = [
      { key: 'recap', label: 'Aperçu élève' },
      { key: 'exercises', label: 'Exercices', count: exercises.length },
      { key: 'results', label: 'Résultats', count: sessions.length },
      { key: 'sources', label: 'Sources' },
    ]
    const showRegenError = status === 'published' && lesson.error && dismissedError !== lesson.error && !editingSources

    body = (
      <div className={styles.stack}>
        <LessonHeader
          ref={testRef}
          lesson={lesson}
          exerciseCount={exercises.length}
          stale={stale}
          busy={busy}
          publishing={publishing}
          onSaveMeta={patch}
          onPublish={() => setHidden(false)}
          onUnpublish={() => setConfirm('unpublish')}
          onTest={() => setPreviewOpen(true)}
          onTestIntent={preloadPlayer}
          onRegenerate={openSourcesEditor}
          onDelete={() => setConfirm('delete')}
          onDriveSave={(url) => patch({ driveUrl: url })}
          onNotifyStudent={notifyStudent}
        />

        {notice && (
          <Alert tone="success" icon={CircleCheck}>
            {notice}
          </Alert>
        )}
        {actionError && (
          <Alert tone="error" icon={CircleAlert} role="alert">
            {actionError}
          </Alert>
        )}
        {showRegenError && (
          <RegenErrorBanner
            error={lesson.error}
            busy={busy}
            onRetry={openSourcesEditor}
            onDismiss={dismissRegenError}
          />
        )}

        {generating && (
          <GeneratingPanel
            key={generationRun}
            lesson={lesson}
            stale={stale}
            busy={regenBusy}
            onRelaunch={() => regenerate({})}
            onEditSources={openSourcesEditor}
          />
        )}
        {status === 'failed' && !editingSources && (
          <FailedPanel lesson={lesson} busy={regenBusy} onRetry={() => regenerate({})} onEditSources={openSourcesEditor} />
        )}

        {editingSources && (
          <RegeneratePanel
            lesson={lesson}
            busy={regenBusy}
            error={regenError}
            onSubmit={regenerate}
            onCancel={closeSourcesEditor}
          />
        )}

        {hasContent ? (
          <section className={styles.content} aria-label="Contenu de la leçon">
            <Tabs tabs={tabs} active={tab} onChange={setTab} idPrefix="lesson" label="Contenu de la leçon" />
            <div
              role="tabpanel"
              id={`lesson-panel-${tab}`}
              aria-labelledby={`lesson-tab-${tab}`}
              tabIndex={0}
              className={styles.panel}
            >
              {tab === 'recap' && (
                <>
                  <p className={styles.previewNote}>
                    <Icon icon={Eye} size={16} className={styles.inlineIcon} />{' '}
                    {lesson.hidden
                      ? "Ce que l'élève verra une fois la leçon publiée."
                      : "Ce que l'élève voit sur sa page."}
                  </p>
                  <LessonView
                    content={lesson.content}
                    title={lesson.title}
                    lessonDate={lesson.lesson_date}
                    studentName={lesson.student_name}
                  />
                </>
              )}
              {tab === 'exercises' && (
                <ExercisesPanel
                  lesson={lesson}
                  exercises={exercises}
                  disabled={generating}
                  resultsCount={sessions.length}
                  error={exerciseError}
                  onRemove={(exerciseId) => {
                    setExerciseError(null)
                    removal.remove(exerciseId)
                  }}
                  onEditStart={removal.flush}
                  onSaved={(saved) => {
                    applyLesson(saved)
                    setNotice(
                      sessions.length
                        ? "Exercice modifié. Les résultats de l'élève sur cette leçon repartent à zéro."
                        : 'Exercice modifié.'
                    )
                    refresh()
                  }}
                  onReload={reload}
                />
              )}
              {tab === 'results' && <LessonResults sessions={sessions} olderCount={olderCount} />}
              {tab === 'sources' && <LessonSources lesson={lesson} />}
            </div>
          </section>
        ) : (
          <section aria-labelledby="lesson-sources-title">
            <h2 id="lesson-sources-title" className={ui.sectionTitle}>
              <Icon icon={FileText} size={22} /> Sources
            </h2>
            <LessonSources lesson={lesson} />
          </section>
        )}

        {removal.pendingCount > 0 && (
          <UndoToast
            message={removal.pendingCount > 1 ? `${plural(removal.pendingCount, 'exercice')} supprimés` : 'Exercice supprimé'}
            onUndo={removal.undo}
            durationMs={UNDO_MS}
          />
        )}

        {previewOpen && (
          <PreviewLayer label={`Aperçu des exercices : ${lessonTitle(lesson)}`}>
            <PracticePlayer preview exercises={exercises} title={lessonTitle(lesson)} onExit={closePreview} />
          </PreviewLayer>
        )}
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>{`${title} — Preply Lessons`}</title>
      </Head>
      <BackLink href={backLink.href} label={backLink.label} />
      {body}

      <ConfirmDialog
        open={confirm === 'unpublish'}
        title="Retirer la leçon de l'espace élève ?"
        message="L'élève ne la verra plus, ni ses exercices dans ses révisions. Ses résultats sont conservés : tu pourras la republier à tout moment."
        confirmLabel="Retirer"
        icon={EyeOff}
        onConfirm={() => setHidden(true)}
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
    </>
  )
}

export default function TeacherLessonPage() {
  const router = useRouter()
  const { id, tab, duplicate } = router.query

  // One-shot query params (?tab=results from the dashboard, ?duplicate=1 from the new lesson
  // form) only seed LessonScreen's initial state, then leave the URL so a reload does not replay them.
  useEffect(() => {
    if (!router.isReady || (!tab && !duplicate)) return
    router.replace({ pathname: router.pathname, query: { id } }, undefined, { shallow: true })
  }, [router, id, tab, duplicate])

  let content
  if (!router.isReady) {
    content = <LessonSkeleton />
  } else if (!isValidId(id)) {
    content = (
      <PageState
        icon={SearchX}
        headingLevel={1}
        title="Leçon introuvable"
        text="Ce lien ne correspond à aucune leçon."
        link={{ href: '/teacher', label: 'Retour à mes élèves' }}
      />
    )
  } else {
    content = (
      <LessonScreen key={id} id={id} initialTab={TAB_KEYS.includes(tab) ? tab : 'recap'} duplicate={duplicate === '1'} />
    )
  }

  return <TeacherShell>{content}</TeacherShell>
}
