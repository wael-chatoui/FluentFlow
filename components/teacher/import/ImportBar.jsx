import { plural } from '@/components/teacher/format'
import { RUN_CONCURRENCY } from '@/components/teacher/import/useImportRunner'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/import/Import.module.css'

function quoteList(titles) {
  return titles.map((t) => `« ${t} »`).join(', ')
}

/**
 * Sticky bottom bar of the import page (docked above the mobile tab bar).
 * Idle: summary + IMPORTER (+ "retry the failed ones"). Running: overall progress,
 * the lessons being generated and "stop launching the next ones".
 * @param {{ running: boolean,
 *   progress: { total: number, done: number, queued: number, waiting: number, current: string[] } | null,
 *   stopRequested: boolean, onStop: () => void,
 *   readyCount: number, pendingCount: number, extractingCount: number, retryCount: number,
 *   blocker: string | null, review: boolean, retryDisabled?: boolean,
 *   onImport: () => void, onRetryFailed: () => void }} props
 */
export default function ImportBar({
  running,
  progress,
  stopRequested,
  onStop,
  readyCount,
  pendingCount,
  extractingCount = 0,
  retryCount = 0,
  blocker,
  review,
  retryDisabled = false,
  onImport,
  onRetryFailed,
}) {
  if (running && progress) {
    const { total, done, queued, waiting, current } = progress
    const percent = total ? Math.round((done / total) * 100) : 0
    return (
      <div className={`${styles.bar} ${styles.barRunning} no-print`}>
        <div className={styles.barInfo}>
          <p className={styles.barTitle} aria-live="polite" aria-atomic="true">
            <span className={bits.spinner} aria-hidden="true" /> Import en cours ·{' '}
            {plural(done, 'leçon terminée', 'leçons terminées')} sur {total}
          </p>
          {current.length > 0 && (
            <p className={styles.barSub} title={quoteList(current)}>
              En génération : {quoteList(current)}
            </p>
          )}
          <div className={styles.overall}>
            <div
              className={styles.overallTrack}
              role="progressbar"
              aria-label="Leçons terminées"
              aria-valuemin={0}
              aria-valuemax={total}
              aria-valuenow={done}
              aria-valuetext={`${done} sur ${total}`}
            >
              <div className={styles.overallFill} style={{ width: `${Math.max(percent, 4)}%` }} />
            </div>
            <span className={styles.overallCount}>
              {done} / {total}
            </span>
          </div>
          <p className={styles.barNote}>
            {waiting > 0
              ? "Garde cette page ouverte jusqu'à l'envoi du dernier document : les leçons déjà envoyées continuent d'être générées même si tu pars."
              : "Tout est envoyé : tu peux quitter la page, les leçons continuent d'être générées."}
          </p>
        </div>
        {(queued > 0 || stopRequested) && (
          <button
            type="button"
            className={`${ui.btn} ${ui.small} ${bits.redGhost} ${bits.tap} ${styles.stop}`}
            onClick={onStop}
            disabled={stopRequested}
          >
            {stopRequested ? (
              'Arrêt : les leçons en cours se terminent…'
            ) : (
              <>
                <span aria-hidden="true">✋</span> Ne pas lancer les suivantes
              </>
            )}
          </button>
        )}
      </div>
    )
  }

  const canImport = !blocker && readyCount > 0
  const summary = readyCount > 0 ? plural(readyCount, 'document prêt', 'documents prêts') : 'Aucun document prêt'
  let sub = blocker
  if (!sub && extractingCount > 0) sub = `Extraction en cours pour ${plural(extractingCount, 'document')}…`
  if (!sub && readyCount > 0) {
    sub = review
      ? "Brouillons : l'élève ne les verra qu'une fois publiés."
      : `Publiées pour l'élève dès qu'elles sont prêtes · ${RUN_CONCURRENCY} leçons générées à la fois.`
  }

  return (
    <div className={`${styles.bar} no-print`}>
      <div className={styles.barInfo}>
        <p className={styles.barTitle} aria-live="polite" aria-atomic="true">
          <span aria-hidden="true">{readyCount > 0 ? '✅ ' : '📂 '}</span>
          {summary}
          {pendingCount > 0 && <span className={styles.barMuted}> · {pendingCount} à vérifier</span>}
        </p>
        {sub && <p className={styles.barSub}>{sub}</p>}
      </div>
      <div className={styles.barActions}>
        {retryCount > 0 && (
          <button
            type="button"
            className={`${ui.btn} ${ui.orange} ${styles.retryAll}`}
            onClick={onRetryFailed}
            disabled={retryDisabled}
          >
            <span aria-hidden="true">🔄</span> Réessayer {retryCount > 1 ? `les ${retryCount} échecs` : "l'échec"}
          </button>
        )}
        {(readyCount > 0 || retryCount === 0) && (
          <button type="button" className={`${ui.btn} ${ui.green} ${styles.submit}`} onClick={onImport} disabled={!canImport}>
            <span aria-hidden="true">📥</span> {readyCount > 0 ? `Importer ${plural(readyCount, 'leçon')}` : 'Importer'}
          </button>
        )}
      </div>
    </div>
  )
}
