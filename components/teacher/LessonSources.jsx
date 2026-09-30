import { EXERCISE_TYPE_LABELS, formatCount } from '@/components/teacher/format'
import styles from '@/components/teacher/lessons/LessonSources.module.css'
import { FileText, Mic, Palette, Sparkles } from 'lucide-react'
import Icon from '@/components/ui/Icon'

function Source({ title, icon, tone, text, open }) {
  const value = (text || '').trim()
  const n = formatCount(value.length)
  return (
    <details className={`${styles.source} ${styles[tone]}`} open={open}>
      <summary className={styles.summary}>
        <span className={styles.icon} aria-hidden="true">
          <Icon icon={icon} size={20} />
        </span>
        <span className={styles.title}>{title}</span>
        {value ? (
          <span className={styles.count}>
            <span aria-hidden="true">{n} car.</span>
            <span className="sr-only">, {n} caractères</span>
          </span>
        ) : (
          <span className={styles.count}>
            <span className="sr-only">, </span>vide
          </span>
        )}
        <span className={styles.chevron} aria-hidden="true" />
      </summary>
      {value ? <div className={styles.text}>{value}</div> : <p className={styles.empty}>Rien n&apos;a été collé ici.</p>}
    </details>
  )
}

/** One-line summary of the generation options stored with a lesson, or null. */
export function describeOptions(options) {
  if (!options || typeof options !== 'object') return null
  const parts = []
  if (Number.isInteger(options.count)) parts.push(`${options.count} exercices`)
  if (Array.isArray(options.types) && options.types.length) {
    parts.push(options.types.map((t) => EXERCISE_TYPE_LABELS[t] || t).join(', '))
  }
  return parts.length ? parts.join(' · ') : null
}

/**
 * Read-only sources of a lesson (line breaks preserved): transcript + Canva notes,
 * or the imported document for `source_kind: 'import'`, plus the generation options.
 * @param {{ lesson: object, defaultOpen?: boolean }} props
 */
export default function LessonSources({ lesson, defaultOpen = false }) {
  const imported = lesson.source_kind === 'import'
  const options = lesson.generation_options
  const summary = describeOptions(options)
  const instructions = typeof options?.instructions === 'string' ? options.instructions.trim() : ''

  return (
    <div className={styles.sources}>
      {imported ? (
        <Source
          title={`Document importé${lesson.source_name ? ` : ${lesson.source_name}` : ''}`}
          icon={FileText}
          tone="blue"
          text={lesson.source_text}
          open={defaultOpen}
        />
      ) : (
        <>
          <Source title="Transcription" icon={Mic} tone="blue" text={lesson.transcript} open={defaultOpen} />
          <Source title="Notes Canva" icon={Palette} tone="pink" text={lesson.canva} open={defaultOpen} />
        </>
      )}
      {(summary || instructions) && (
        <dl className={styles.options}>
          {summary && (
            <div>
              <dt>Exercices demandés</dt>
              <dd>{summary}</dd>
            </div>
          )}
          {instructions && (
            <div>
              <dt>Consignes pour l&apos;IA</dt>
              <dd>{instructions}</dd>
            </div>
          )}
        </dl>
      )}
      {lesson.ai_model && (
        <p className={styles.aiModel}>
          <Icon icon={Sparkles} size={14} className={styles.aiIcon} /> Modèle IA : {lesson.ai_model}
        </p>
      )}
    </div>
  )
}
