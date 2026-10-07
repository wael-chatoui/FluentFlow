import { useId } from 'react'
import Link from 'next/link'
import { formatElapsed, formatLessonDate, todayLocal } from '@/components/teacher/format'
import { useElapsedSeconds } from '@/components/teacher/hooks'
import {
  MAX_TEXT,
  MAX_TITLE,
  MIN_TEXT,
  formatBytes,
  formatCount,
  sourceIssue,
} from '@/components/teacher/import/importUtils'
import { canRetry } from '@/components/teacher/import/rows'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/import/SourceRow.module.css'
import { Calendar, Check, ChevronDown, ChevronRight, CircleAlert, CircleCheck, CircleX, Clock, FilePen, FileText, FileType, Hourglass, LinkIcon, PartyPopper, RefreshCw, TriangleAlert, X } from 'lucide-react'
import Icon from '@/components/ui/Icon'

const KIND = {
  pdf: { icon: FileText, tone: styles.kindPdf, sr: 'PDF' },
  text: { icon: FileType, tone: styles.kindText, sr: 'fichier texte' },
  link: { icon: LinkIcon, tone: styles.kindLink, sr: 'lien' },
}

const DATE_FROM = {
  name: 'Date trouvée dans le nom du document',
  text: 'Date trouvée dans le texte du document',
}

/** Compact "the AI is cooking" line for a document being generated. */
function RowProgress({ startedAt }) {
  const elapsed = useElapsedSeconds(startedAt)
  // Asymptotic, like GenerationProgress: never 100 % before the lesson is ready
  const percent = Math.min(96, Math.round((1 - Math.exp(-elapsed / 50)) * 100))
  return (
    <div className={styles.progress}>
      <div className={styles.progressBar} aria-hidden="true">
        <div className={styles.progressFill} style={{ width: `${Math.max(percent, 6)}%` }} />
      </div>
      <span className={styles.timer}>
        <Icon icon={Clock} size={14} />
        <span className="sr-only">Temps écoulé : </span>
        {formatElapsed(elapsed)}
      </span>
    </div>
  )
}

function pillFor(row, issue, dateError, existing) {
  if (row.run === 'sending') return { tone: styles.pillPurple, text: 'Envoi…' }
  if (row.run === 'generating') return { tone: styles.pillPurple, text: 'Génération…' }
  if (row.run === 'queued') return { tone: styles.pillGrey, text: 'En attente' }
  if (row.run === 'published') {
    return row.hidden
      ? { tone: styles.pillOrange, icon: FilePen, text: 'Brouillon' }
      : { tone: styles.pillGreen, icon: CircleCheck, text: 'Publiée' }
  }
  if (row.run === 'failed') return { tone: styles.pillRed, icon: CircleX, text: 'Échec' }
  if (existing?.matchKind === 'source' || row.dbDuplicate) {
    return { tone: styles.pillOrange, icon: TriangleAlert, text: 'Déjà en base' }
  }
  if (issue?.tone === 'loading') return { tone: styles.pillBlue, text: 'Extraction…' }
  if (issue?.tone === 'error') return { tone: styles.pillRed, text: 'Erreur' }
  if (issue?.tone === 'warning' || dateError) return { tone: styles.pillOrange, text: 'À vérifier' }
  return { tone: styles.pillBlue, text: 'Prête' }
}

function extractSummary(row) {
  const len = row.text.trim().length
  const chars = `${formatCount(len)} caractère${len > 1 ? 's' : ''}`
  if (row.manual) return `Texte saisi à la main · ${chars}`
  const parts = [chars]
  if (Number.isFinite(row.pages)) parts.push(`${row.pages} page${row.pages > 1 ? 's' : ''}`)
  return `${row.textEdited ? 'Texte modifié · ' : ''}${parts.join(' · ')}`
}

function metaFor(row) {
  if (row.restored) return 'Envoyé avant le rechargement de la page'
  if (row.kind === 'link') return 'Lien Google'
  return `${row.kind === 'pdf' ? 'PDF' : 'Texte'} · ${formatBytes(row.size)}`
}

/**
 * One document of the import list: editable title + date, extraction status,
 * editable text, then the generation status once it is sent.
 * @param {{ row: object, index: number, title: string, dateError: string | null,
 *   existing: { title: string } | null, busy: boolean, retryDisabled?: boolean,
 *   canApplyDate?: boolean, newTab?: boolean,
 *   onChange: (patch: object) => void, onApplyDate: () => void, onRemove: () => void,
 *   onRetryExtract: () => void, onRetryRun: () => void }} props
 *   `busy` = the queue is running (rows are read-only); `existing` = a lesson of the
 *   student already has this date; `newTab` opens lesson links in a new tab (keeps the run on screen).
 */
export default function SourceRow({
  row,
  index,
  title,
  dateError,
  existing = null,
  busy,
  retryDisabled = false,
  canApplyDate = false,
  newTab = false,
  onChange,
  onApplyDate,
  onRemove,
  onRetryExtract,
  onRetryRun,
}) {
  const uid = useId()
  const issue = row.lessonId ? null : sourceIssue(row)
  const pill = pillFor(row, issue, dateError, existing)
  const inRun = row.run === 'queued' || row.run === 'sending' || row.run === 'generating'
  // Once the lesson exists on the server its text / title / date are stored there
  const locked = busy || inRun || Boolean(row.lessonId)
  const kind = KIND[row.kind] || KIND.pdf
  const name = row.sourceName || row.label
  const textLen = row.text.trim().length
  const textOpen = row.showText
  const canEditText = !row.restored && (row.extract === 'done' || row.extract === 'error')
  const textLabel = row.extract === 'error' ? 'Coller le texte à la main' : 'Voir le texte'
  const linkProps = newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {}
  const newTabNote = newTab ? <span className="sr-only"> (nouvel onglet)</span> : null

  const setText = (value) => {
    if (row.extract === 'error') {
      onChange({ text: value, extract: 'done', manual: true, extractError: null, warning: null, textEdited: true })
    } else {
      onChange({ text: value, textEdited: true })
    }
  }

  const lessonLink = (label, tone) => (
    <Link href={`/teacher/lessons/${row.lessonId}`} className={`${ui.btn} ${ui.small} ${tone} ${bits.tap}`} {...linkProps}>
      {label}
      {newTabNote}
    </Link>
  )

  // ---- Status line (live) + its actions ----
  let tone = ''
  let icon = null
  let message = ''
  let actions = null
  let note = null

  if (row.run === 'sending' || row.run === 'generating') {
    tone = styles.statusPurple
    icon = <span className={bits.spinner} aria-hidden="true" />
    message = row.run === 'sending' ? 'Envoi du document…' : "Génération… L'IA prépare le bilan et les exercices."
    if (row.pollTrouble) note = 'Connexion instable : nouvel essai automatique… La génération continue sur le serveur.'
    if (row.lessonId) actions = lessonLink('Voir la leçon', bits.blueGhost)
  } else if (row.run === 'queued') {
    tone = styles.statusGrey
    icon = <Icon icon={Hourglass} size={18} />
    message = 'En attente…'
  } else if (row.run === 'published') {
    tone = row.hidden ? styles.statusOrange : styles.statusGreen
    icon = <Icon icon={row.hidden ? FilePen : PartyPopper} size={18} />
    message = row.hidden ? "Brouillon prêt : relis-le puis publie-le pour l'élève." : 'Leçon publiée !'
    actions = lessonLink(row.hidden ? 'Relire la leçon' : 'Voir la leçon', row.hidden ? ui.orange : ui.green)
  } else if (row.run === 'failed') {
    tone = styles.statusRed
    icon = <Icon icon={CircleAlert} size={18} />
    message = row.runError || 'La génération a échoué.'
    if (row.lessonId && !row.stale) {
      note = 'La leçon est enregistrée avec le texte du document : « Réessayer » relance seulement la génération.'
    } else if (row.restored && !row.lessonId) {
      note = 'Ajoute à nouveau le document pour réessayer.'
    } else if (!row.lessonId && (issue || dateError)) {
      // Why « Réessayer » is disabled
      note = issue?.message || dateError
    }
    actions = (
      <>
        <button
          type="button"
          className={`${ui.btn} ${ui.small} ${ui.orange} ${bits.tap}`}
          onClick={onRetryRun}
          disabled={retryDisabled || !canRetry(row)}
        >
          <Icon icon={RefreshCw} size={16} /> Réessayer
        </button>
        {row.lessonId && lessonLink('Voir la leçon', bits.blueGhost)}
      </>
    )
  } else if (issue?.tone === 'loading') {
    tone = styles.statusBlue
    icon = <span className={bits.spinner} aria-hidden="true" />
    message = row.kind === 'link' ? 'Récupération du document…' : 'Extraction du texte…'
  } else if (issue?.tone === 'error') {
    tone = styles.statusRed
    icon = <Icon icon={CircleAlert} size={18} />
    message = issue.message
    if (row.extract === 'error') {
      actions = (
        <button type="button" className={`${ui.btn} ${ui.small} ${bits.tap}`} onClick={onRetryExtract} disabled={busy}>
          <Icon icon={RefreshCw} size={16} /> Réessayer l&apos;extraction
        </button>
      )
    }
  } else if (issue?.tone === 'warning') {
    tone = styles.statusOrange
    icon = <Icon icon={TriangleAlert} size={18} />
    message = issue.message
    if (issue.dismissible) {
      actions = (
        <button
          type="button"
          className={`${ui.btn} ${ui.small} ${bits.tap}`}
          onClick={() => onChange({ warningDismissed: true })}
          disabled={locked}
        >
          Le texte me convient
        </button>
      )
    }
  } else if (dateError) {
    // The error itself is shown under the date field
    tone = styles.statusOrange
    icon = <Icon icon={Calendar} size={18} />
    message = `${extractSummary(row)} · date du cours à vérifier`
  } else {
    tone = styles.statusOk
    icon = <Icon icon={Check} size={18} strokeWidth={3} />
    message = extractSummary(row)
  }

  const titleId = `${uid}-title`
  const titleHintId = `${uid}-title-hint`
  const dateId = `${uid}-date`
  const dateNoteId = `${uid}-date-note`
  const textId = `${uid}-text`
  // Not while extracting: the text may still give the date
  const showDateError = Boolean(dateError) && !locked && issue?.tone !== 'loading'
  const dateNote = showDateError ? dateError : DATE_FROM[row.dateFrom] || null

  return (
    <li
      className={`${styles.row} ${inRun ? styles.rowRunning : ''} ${row.run === 'published' ? styles.rowDone : ''}`}
    >
      <div className={styles.head}>
        <span className={`${styles.kind} ${kind.tone}`} aria-hidden="true">
          <Icon icon={kind.icon} size={22} />
        </span>
        <div className={styles.headText}>
          <p className={styles.name} title={name}>
            <span className="sr-only">{`Document ${index + 1} (${kind.sr}) : `}</span>
            {name}
          </p>
          <div className={styles.metaRow}>
            <span className={`${styles.pill} ${pill.tone}`}>
              {pill.icon && <Icon icon={pill.icon} size={13} />}
              {pill.text}
            </span>
            <span className={styles.meta}>{metaFor(row)}</span>
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
          <Icon icon={X} size={20} />
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
            maxLength={MAX_TITLE}
            autoComplete="off"
            disabled={locked}
            aria-describedby={!title && !locked ? titleHintId : undefined}
          />
          {!title && !locked && (
            <p id={titleHintId} className={`${bits.hint} ${styles.fieldNote}`}>
              Vide : l&apos;IA proposera un titre.
            </p>
          )}
        </div>
        <div className={styles.field}>
          <label htmlFor={dateId} className={bits.label}>
            Date du cours
          </label>
          <input
            id={dateId}
            type="date"
            className={`${bits.input} ${showDateError ? bits.invalid : ''}`}
            value={row.lessonDate}
            max={todayLocal()}
            onChange={(e) => onChange({ lessonDate: e.target.value, dateFrom: null })}
            disabled={locked}
            required
            aria-invalid={showDateError || undefined}
            aria-describedby={dateNote ? dateNoteId : undefined}
          />
          {dateNote && (
            <p id={dateNoteId} className={`${showDateError ? bits.fieldError : bits.hint} ${styles.fieldNote}`}>
              <Icon icon={showDateError ? CircleAlert : Calendar} size={15} className={styles.noteIcon} />{' '}
              {dateNote}
            </p>
          )}
          {canApplyDate && !locked && !dateError && (
            <button type="button" className={styles.applyDate} onClick={onApplyDate}>
              Appliquer cette date à toutes les lignes
            </button>
          )}
        </div>
      </div>

      {existing && !row.lessonId && !locked && (
        <p className={styles.existing}>
          <Icon icon={TriangleAlert} size={15} className={styles.noteIcon} />{' '}
          {existing.matchKind === 'source'
            ? `Ce document a déjà été importé pour cet élève (leçon « ${existing.title} » du ${formatLessonDate(existing.lesson_date)}).`
            : `Une leçon du ${formatLessonDate(row.lessonDate)} existe déjà pour cet élève${
                existing.title ? ` (« ${existing.title} »)` : ''
              } : vérifie que ce document n'est pas déjà importé.`}
        </p>
      )}

      <div className={`${styles.status} ${tone}`}>
        <div className={styles.statusMain}>
          <span className={styles.statusIcon} aria-hidden="true">
            {icon}
          </span>
          <div className={styles.statusBody}>
            <p className={styles.statusText} aria-live="polite" aria-atomic="true">
              <span className="sr-only">{`${title || name} : `}</span>
              {message}
            </p>
            {inRun && row.run !== 'queued' && row.startedAt && <RowProgress startedAt={row.startedAt} />}
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
            <Icon icon={textOpen ? ChevronDown : ChevronRight} size={16} strokeWidth={3} />
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
