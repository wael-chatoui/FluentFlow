import { plural } from '@/components/teacher/format'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/import/Import.module.css'

/**
 * Sticky bottom bar of the import page (docked above the mobile tab bar).
 * Idle: summary + big IMPORTER button. Running: overall progress + "stop after this one".
 * @param {{ running: boolean, readyCount: number, pendingCount: number, extractingCount: number,
 *   blocker: string | null,
 *   onImport: () => void, run: { total: number, done: number, currentTitle: string } | null,
 *   stopRequested: boolean, onStop: () => void }} props
 */
export default function ImportBar({
  running,
  readyCount,
  pendingCount,
  extractingCount = 0,
  blocker,
  onImport,
  run,
  stopRequested,
  onStop,
}) {
  if (running && run) {
    const percent = run.total ? Math.round((run.done / run.total) * 100) : 0
    const position = Math.min(run.done + 1, run.total)
    return (
      <div className={`${styles.bar} ${styles.barRunning} no-print`}>
        <div className={styles.barInfo}>
          <p className={styles.barTitle} aria-live="polite" aria-atomic="true">
            <span className={bits.spinner} aria-hidden="true" /> Import en cours · leçon {position} sur {run.total}
          </p>
          {run.currentTitle && (
            <p className={styles.barSub}>
              « {run.currentTitle} » en génération…
            </p>
          )}
          <div className={styles.overall}>
            <div
              className={styles.overallTrack}
              role="progressbar"
              aria-label="Leçons traitées"
              aria-valuemin={0}
              aria-valuemax={run.total}
              aria-valuenow={run.done}
              aria-valuetext={`${run.done} sur ${run.total}`}
            >
              <div className={styles.overallFill} style={{ width: `${Math.max(percent, 4)}%` }} />
            </div>
            <span className={styles.overallCount}>
              {run.done} / {run.total}
            </span>
          </div>
        </div>
        <button
          type="button"
          className={`${ui.btn} ${ui.small} ${bits.redGhost} ${bits.tap} ${styles.stop}`}
          onClick={onStop}
          disabled={stopRequested || position >= run.total}
        >
          {stopRequested ? (
            'Arrêt après cette leçon…'
          ) : (
            <>
              <span aria-hidden="true">✋</span> Arrêter après celle-ci
            </>
          )}
        </button>
      </div>
    )
  }

  const canImport = !blocker && readyCount > 0
  const summary = readyCount > 0 ? plural(readyCount, 'document prêt', 'documents prêts') : 'Aucun document prêt'

  return (
    <div className={`${styles.bar} no-print`}>
      <div className={styles.barInfo}>
        <p className={styles.barTitle} aria-live="polite" aria-atomic="true">
          <span aria-hidden="true">{readyCount > 0 ? '✅ ' : '📂 '}</span>
          {summary}
          {pendingCount > 0 && <span className={styles.barMuted}> · {pendingCount} à vérifier</span>}
        </p>
        {blocker ? (
          <p className={styles.barSub}>{blocker}</p>
        ) : (
          extractingCount > 0 && (
            <p className={styles.barSub}>
              Extraction en cours pour {extractingCount} document{extractingCount > 1 ? 's' : ''}…
            </p>
          )
        )}
      </div>
      <button
        type="button"
        className={`${ui.btn} ${ui.green} ${styles.submit}`}
        onClick={onImport}
        disabled={!canImport}
      >
        <span aria-hidden="true">📥</span>{' '}
        {readyCount > 0 ? `Importer ${plural(readyCount, 'leçon')}` : 'Importer'}
      </button>
    </div>
  )
}
