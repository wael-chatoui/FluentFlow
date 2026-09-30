import { useEffect, useState } from 'react'
import GenerationProgress, { generationSteps } from '@/components/teacher/GenerationProgress'
import { hasEnoughText } from '@/components/teacher/format'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/LessonPage.module.css'
import { CircleAlert, Hourglass, Pencil, RefreshCw, TriangleAlert } from 'lucide-react'
import Icon from '@/components/ui/Icon'

function stepsFor(lesson) {
  if (lesson.source_kind === 'import') return generationSteps({ mode: 'import' })
  return generationSteps({ hasTranscript: hasEnoughText(lesson.transcript), hasCanva: hasEnoughText(lesson.canva) })
}

/**
 * Start of the current generation for the timer, never in the future (server clock ahead):
 * `generation_started_at` when the API sends it, else `firstSeen` (the first `updated_at`
 * seen during this run: every PATCH made while the AI works — title, date, Drive link,
 * publishing — bumps `updated_at` again), else the current `updated_at` (null if unknown).
 * @param {object} lesson
 * @param {number | null} firstSeen
 */
export function generationStartedAt(lesson, firstSeen, now = Date.now()) {
  const at = (iso) => {
    const t = Date.parse(iso || '')
    return Number.isFinite(t) ? Math.min(t, now) : null
  }
  return at(lesson?.generation_started_at) ?? firstSeen ?? at(lesson?.updated_at)
}

/**
 * Lesson in 'generating': progress card (the timer starts when the generation was
 * claimed) or, when the API flags it as stale, a warning with « Relancer » /
 * « Modifier les sources ». Mount one panel per generation run (`key`): the start is
 * remembered for the panel's lifetime, so edits made meanwhile do not restart the timer.
 */
export function GeneratingPanel({ lesson, stale, busy = false, onRelaunch, onEditSources }) {
  const [mountedAt] = useState(Date.now)
  // null right after « Régénérer » (updated_at unknown until the refresh)
  const [firstSeen, setFirstSeen] = useState(() => generationStartedAt(lesson, null))
  const known = generationStartedAt(lesson, firstSeen)
  useEffect(() => {
    if (firstSeen === null && known !== null) setFirstSeen(known)
  }, [firstSeen, known])
  const startedAt = known ?? mountedAt

  if (stale) {
    return (
      <div className={`${bits.alert} ${bits.warning}`} role="alert">
        <span className={bits.alertIcon} aria-hidden="true">
          <Icon icon={Hourglass} size={20} />
        </span>
        <div className={bits.alertBody}>
          <strong>La génération semble bloquée</strong>
          <span>
            Aucune réponse depuis plus de 5 minutes.{' '}
            {lesson.content ? "L'élève voit toujours la version précédente." : ''} Tu peux la relancer.
          </span>
          <div className={bits.alertActions}>
            <button type="button" className={`${ui.btn} ${ui.small} ${ui.orange} ${bits.tap}`} onClick={onRelaunch} disabled={busy}>
              {busy ? <span className={bits.spinner} aria-hidden="true" /> : <Icon icon={RefreshCw} size={18} />} Régénérer
            </button>
            <button type="button" className={`${ui.btn} ${ui.small} ${bits.tap}`} onClick={onEditSources} disabled={busy}>
              Modifier les sources
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <GenerationProgress
      startedAt={startedAt}
      heading={lesson.content ? 'Régénération en cours…' : 'Génération en cours…'}
      sub={
        lesson.content
          ? "Tu peux quitter cette page, la nouvelle version continue de se préparer. En attendant, l'élève garde la version actuelle."
          : 'Tu peux quitter cette page, la leçon continue de se préparer. Cela prend en général 30 secondes à 2 minutes.'
      }
      steps={stepsFor(lesson)}
      note="La page se met à jour toute seule."
    />
  )
}

/** Lesson in 'failed' (first generation failed, nothing published): error + retry. */
export function FailedPanel({ lesson, busy = false, onRetry, onEditSources }) {
  const imported = lesson.source_kind === 'import'
  return (
    <section className={styles.failed} role="alert" aria-labelledby="lesson-failed-title">
      <span className={styles.failedIcon} aria-hidden="true">
        <Icon icon={CircleAlert} size={28} />
      </span>
      <div className={styles.failedBody}>
        <h2 id="lesson-failed-title" className={styles.failedTitle}>La génération a échoué</h2>
        <p className={styles.failedError}>{lesson.error || 'Erreur inconnue.'}</p>
        <p className={styles.failedText}>
          {imported
            ? 'Le document importé est conservé : relance la génération, en changeant les options si besoin.'
            : 'La transcription et les notes sont conservées : relance la génération telle quelle, ou corrige-les avant.'}
        </p>
        <div className={styles.failedActions}>
          <button type="button" className={`${ui.btn} ${ui.blue}`} onClick={onRetry} disabled={busy}>
            {busy ? <span className={bits.spinner} aria-hidden="true" /> : <Icon icon={RefreshCw} size={18} />} Réessayer
          </button>
          <button type="button" className={`${ui.btn} ${bits.blueGhost}`} onClick={onEditSources} disabled={busy}>
            <Icon icon={Pencil} size={18} /> {imported ? 'Changer les options' : 'Modifier les sources et régénérer'}
          </button>
        </div>
      </div>
    </section>
  )
}

/** Published lesson whose last regeneration failed: the old version is still online. */
export function RegenErrorBanner({ error, busy = false, onRetry, onDismiss }) {
  return (
    <div className={`${bits.alert} ${bits.warning}`} role="status">
      <span className={bits.alertIcon} aria-hidden="true">
          <Icon icon={TriangleAlert} size={20} />
        </span>
      <div className={bits.alertBody}>
        <strong>La dernière régénération a échoué</strong>
        <span>{error}</span>
        <span>L&apos;ancienne version reste en ligne pour l&apos;élève.</span>
        <div className={bits.alertActions}>
          <button type="button" className={`${ui.btn} ${ui.small} ${ui.orange} ${bits.tap}`} onClick={onRetry} disabled={busy}>
            <Icon icon={RefreshCw} size={16} /> Réessayer
          </button>
          <button type="button" className={`${ui.btn} ${ui.small} ${bits.tap}`} onClick={onDismiss}>
            Ignorer<span className="sr-only"> l&apos;échec</span>
          </button>
        </div>
      </div>
    </div>
  )
}
