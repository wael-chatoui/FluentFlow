import { useId } from 'react'
import Link from 'next/link'
import { formatElapsed } from '@/components/teacher/format'
import { useElapsedSeconds } from '@/components/teacher/hooks'
import {
  MAX_TEXT,
  MAX_TITLE,
  MIN_TEXT,
  formatBytes,
  formatCount,
  sourceIssue,
} from '@/components/teacher/import/importUtils'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/import/SourceRow.module.css'

/** Compact "the AI is cooking" line for the item being generated. */
function RowProgress({ startedAt }) {
  const elapsed = useElapsedSeconds(startedAt)
  // Asymptotic, like GenerationProgress: never 100 % before the answer arrives
  const percent = Math.min(96, Math.round((1 - Math.exp(-elapsed / 50)) * 100))
  return (
    <div className={styles.progress}>
      <div className={styles.progressBar} aria-hidden="true">
        <div className={styles.progressFill} style={{ width: `${Math.max(percent, 6)}%` }} />
      </div>
      <span className={styles.timer}>
        <span aria-hidden="true">⏱️ </span>
        <span className="sr-only">Temps écoulé : </span>
        {formatElapsed(elapsed)}
      </span>
    </div>
  )
}

function pillFor(row, issue, dateError) {
  if (row.run === 'running') return { tone: styles.pillPurple, text: 'Génération…' }
  if (row.run === 'queued') return { tone: styles.pillGrey, text: 'En attente' }
  if (row.run === 'published') return { tone: styles.pillGreen, text: '✅ Publiée' }
  if (row.run === 'failed') return { tone: styles.pillRed, text: '❌ Échec' }
  if (issue?.tone === 'loading') return { tone: styles.pillBlue, text: 'Extraction…' }
  if (issue?.tone === 'error') return { tone: styles.pillRed, text: 'Erreur' }
  if (issue?.tone === 'warning' || dateError) return { tone: styles.pillOrange, text: 'À vérifier' }
  return { tone: styles.pillBlue, text: 'Prête' }
}

function extractSummary(row) {
  const len = row.text.trim().length
  const parts = [`${formatCount(len)} caractère${len > 1 ? 's' : ''}`]
  if (row.manual) return `Texte saisi à la main · ${parts[0]}`
  if (Number.isFinite(row.pages)) parts.push(`${row.pages} page${row.pages > 1 ? 's' : ''}`)
  return `${row.textEdited ? 'Texte modifié · ' : ''}${parts.join(' · ')}`
}

/**
 * One document of the import list: editable title + date, extraction status,
 * editable text, then the generation status once the queue runs.
 * @param {{ row: object, index: number, title: string, dateError: string | null,
 *   busy: boolean, retryDisabled?: boolean, onChange: (patch: object) => void, onRemove: () => void,
 *   onRetryExtract: () => void, onRetryRun: () => void }} props
 *   `busy` = the queue is running (every row is read-only).
 */
export default function SourceRow({
  row,
  index,
  title,
  dateError,
  busy,
  retryDisabled = false,
  onChange,
  onRemove,
  onRetryExtract,
  onRetryRun,
}) {
  const uid = useId()
  const issue = sourceIssue(row)
  const pill = pillFor(row, issue, dateError)
  const inRun = row.run === 'queued' || row.run === 'running'
  // Once the lesson exists on the server its text / title / date are stored there
  const locked = busy || inRun || Boolean(row.lessonId)
  const isPdf = row.kind === 'pdf'
  const name = row.sourceName || row.label
  const textLen = row.text.trim().length
  const textOpen = row.showText
  const canEditText = row.extract === 'done' || row.extract === 'error'
  const textLabel = row.extract === 'error' ? 'Coller le texte à la main' : 'Voir le texte'

  const setText = (value) => {
    if (row.extract === 'error') {
      onChange({ text: value, extract: 'done', manual: true, extractError: null, warning: null, textEdited: true })
    } else {
      onChange({ text: value, textEdited: true })
    }
  }

  // ---- Status line (live) + its actions ----
  let tone = ''
  let icon = null
  let message = ''
  let actions = null
  let note = null

  if (row.run === 'running') {
    tone = styles.statusPurple
    icon = <span className={bits.spinner} aria-hidden="true" />
    message = "Génération… L'IA prépare le bilan et les exercices."
  } else if (row.run === 'queued') {
    tone = styles.statusGrey
    icon = '⏳'
    message = 'En attente…'
  } else if (row.run === 'published') {
    tone = styles.statusGreen
    icon = '🎉'
    message = 'Leçon publiée !'
    actions = (
      <Link href={`/teacher/lessons/${row.lessonId}`} className={`${ui.btn} ${ui.small} ${ui.green} ${bits.tap}`}>
        Voir la leçon
      </Link>
    )
  } else if (row.run === 'failed') {
    tone = styles.statusRed
    icon = '😵'
    message = row.runError || 'La génération a échoué.'
    if (row.maybeCreated) {
      note = "La leçon a peut-être quand même été créée : vérifie la fiche de l'élève avant de réessayer, pour éviter un doublon."
    } else if (row.lessonId) {
      note = 'La leçon est enregistrée avec le texte du document : « Réessayer » relance seulement la génération.'
    }
    actions = (
      <>
        <button
          type="button"
          className={`${ui.btn} ${ui.small} ${ui.orange} ${bits.tap}`}
          onClick={onRetryRun}
          disabled={busy || retryDisabled || (!row.lessonId && Boolean(issue || dateError))}
        >
          <span aria-hidden="true">🔄</span> Réessayer
        </button>
        {row.lessonId && (
          <Link href={`/teacher/lessons/${row.lessonId}`} className={`${ui.btn} ${ui.small} ${bits.blueGhost} ${bits.tap}`}>
            Voir la leçon
          </Link>
        )}
      </>
    )
  } else if (issue?.tone === 'loading') {
    tone = styles.statusBlue
    icon = <span className={bits.spinner} aria-hidden="true" />
    message = isPdf ? 'Extraction du texte…' : 'Récupération du document…'
  } else if (issue?.tone === 'error') {
    tone = styles.statusRed
    icon = '⚠️'
    message = issue.message
    if (row.extract === 'error') {
      actions = (
        <button type="button" className={`${ui.btn} ${ui.small} ${bits.tap}`} onClick={onRetryExtract} disabled={busy}>
          <span aria-hidden="true">🔄</span> Réessayer l&apos;extraction
        </button>
      )
    }
  } else if (issue?.tone === 'warning') {
    tone = styles.statusOrange
    icon = '🔍'
    message = issue.message
    if (issue.dismissible) {
      actions = (
        <button
          type="button"
          className={`${ui.btn} ${ui.small} ${bits.tap}`}
          onClick={() => onChange({ textEdited: true })}
          disabled={locked}
        >
          Le texte me convient
        </button>
      )
    }
  } else if (dateError) {
    tone = styles.statusOrange
    icon = '📅'
    message = dateError
  } else {
    tone = styles.statusOk
    icon = '✓'
    message = extractSummary(row)
  }

  const titleId = `${uid}-title`
  const dateId = `${uid}-date`
  const textId = `${uid}-text`

  return (
    <li className={`${styles.row} ${row.run === 'running' ? styles.rowRunning : ''} ${row.run === 'published' ? styles.rowDone : ''}`}>
      <div className={styles.head}>
        <span className={`${styles.kind} ${isPdf ? styles.kindPdf : styles.kindLink}`} aria-hidden="true">
          {isPdf ? '📄' : '🔗'}
        </span>
        <div className={styles.headText}>
          <p className={styles.name} title={name}>
            <span className="sr-only">{`Document ${index + 1} (${isPdf ? 'PDF' : 'lien'}) : `}</span>
            {name}
          </p>
          <div className={styles.metaRow}>
            <span className={`${styles.pill} ${pill.tone}`}>{pill.text}</span>
            <span className={styles.meta}>{isPdf ? `PDF · ${formatBytes(row.size)}` : 'Lien Google'}</span>
          </div>
        </div>
        <button
          type="button"
          className={styles.remove}
          onClick={onRemove}
          disabled={busy || inRun}
          aria-label={`Retirer « ${name} » de la liste`}
          title="Retirer de la liste"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </div>

      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor={titleId} className={bits.label}>
            Titre de la leçon
          </label>
          <input
            id={titleId}
            className={bits.input}
            value={title}
            onChange={(e) => onChange({ title: e.target.value })}
            placeholder="Laisse vide : l'IA proposera un titre"
            maxLength={MAX_TITLE}
            autoComplete="off"
            disabled={locked}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={dateId} className={bits.label}>
            Date du cours
          </label>
          <input
            id={dateId}
            type="date"
            className={`${bits.input} ${dateError && !locked ? bits.invalid : ''}`}
            value={row.lessonDate}
            onChange={(e) => onChange({ lessonDate: e.target.value })}
            disabled={locked}
            aria-invalid={(Boolean(dateError) && !locked) || undefined}
            required
          />
        </div>
      </div>

      <div className={`${styles.status} ${tone}`}>
        <div className={styles.statusMain}>
          <span className={styles.statusIcon} aria-hidden="true">{icon}</span>
          <div className={styles.statusBody}>
            <p className={styles.statusText} aria-live="polite" aria-atomic="true">
              <span className="sr-only">{`${title || name} : `}</span>
              {message}
            </p>
            {row.run === 'running' && <RowProgress startedAt={row.startedAt} />}
            {note && <p className={styles.statusNote}>{note}</p>}
          </div>
        </div>
        {actions && <div className={styles.statusActions}>{actions}</div>}
      </div>

      {canEditText && (
        <div className={styles.textBlock}>
          <button
            type="button"
            className={styles.textToggle}
            aria-expanded={textOpen}
            aria-controls={textId}
            onClick={() => onChange({ showText: !textOpen })}
          >
            <span aria-hidden="true">{textOpen ? '▾' : '▸'}</span>
            {textOpen ? 'Masquer le texte' : textLabel}
          </button>
          <div id={textId} hidden={!textOpen} className={styles.textPanel}>
            <label htmlFor={`${textId}-area`} className="sr-only">
              {`Texte du document « ${name} »`}
            </label>
            <textarea
              id={`${textId}-area`}
              className={`${bits.textarea} ${styles.textarea}`}
              value={row.text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              spellCheck={false}
              readOnly={locked}
              placeholder="Colle ici le texte du document…"
              aria-describedby={`${textId}-count`}
            />
            <p id={`${textId}-count`} className={styles.textCount}>
              <span className={textLen >= MIN_TEXT && textLen <= MAX_TEXT ? styles.countOk : styles.countLow}>
                {formatCount(textLen)} caractère{textLen > 1 ? 's' : ''}
              </span>{' '}
              · {MIN_TEXT} minimum
              {row.lessonId && ' · texte enregistré avec la leçon'}
            </p>
          </div>
        </div>
      )}
    </li>
  )
}
