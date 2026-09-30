import { formatNumber } from '@/components/admin/common/format'
import { EXERCISE_TYPE_META } from '@/components/admin/lessons/constants'
import { resolveGenerationOptions } from '@/utils/ai/options'
import admin from '@/components/admin/common/admin.module.css'
import styles from '@/components/admin/lessons/editor.module.css'
import { FileText, Mic, Palette, Settings } from 'lucide-react'
import Icon from '@/components/ui/Icon'

function Source({ icon, title, text, onCopy, empty = 'Rien n’a été collé ici.' }) {
  const value = (text || '').trim()
  return (
    <section className={admin.section}>
      <div className={admin.sectionHead}>
        <h2 className={admin.sectionTitle}>
          <Icon icon={icon} size={20} /> {title}
        </h2>
        <div className={styles.inlineEnd}>
          <span className={admin.sectionSub}>{value ? `${formatNumber(value.length)} caractères` : 'vide'}</span>
          {value && (
            <button type="button" className={styles.insertBtn} onClick={() => onCopy(value, `${title} : texte copié.`)}>
              Copier
            </button>
          )}
        </div>
      </div>
      {value ? (
        <pre className={styles.sourceText} tabIndex={0} aria-label={title}>
          {value}
        </pre>
      ) : (
        <p className={styles.emptyRows}>{empty}</p>
      )}
    </section>
  )
}

/** Exercise options the teacher chose for the generation (import, or create / regenerate with options). */
function Options({ options }) {
  const resolved = resolveGenerationOptions(options)
  if (!resolved) return null
  return (
    <section className={admin.section}>
      <div className={admin.sectionHead}>
        <h2 className={admin.sectionTitle}>
          <Icon icon={Settings} size={20} /> Options de génération
        </h2>
      </div>
      <dl className={styles.facts}>
        <div>
          <dt>Exercices demandés</dt>
          <dd>{resolved.count}</dd>
        </div>
        <div>
          <dt>Types</dt>
          <dd>{resolved.types.map((t) => EXERCISE_TYPE_META[t]?.label || t).join(', ')}</dd>
        </div>
      </dl>
      {resolved.instructions && (
        <>
          <h3 className={styles.previewSub}>Consignes pour l’IA</h3>
          <pre className={styles.sourceText} tabIndex={0} aria-label="Consignes pour l’IA">
            {resolved.instructions}
          </pre>
        </>
      )}
    </section>
  )
}

/**
 * "Sources" tab (read-only, with copy buttons): what the lesson was generated from —
 * the imported document, or the transcript + Canva notes — and the generation options.
 */
export default function SourcesTab({ lesson, onCopy }) {
  const imported = lesson.source_kind === 'import'
  return (
    <div className={admin.stack}>
      {imported ? (
        <Source
          icon={FileText}
          title={lesson.source_name ? `Document importé · ${lesson.source_name}` : 'Document importé'}
          text={lesson.source_text}
          onCopy={onCopy}
          empty="Le texte du document n’a pas été conservé."
        />
      ) : (
        <>
          <Source icon={Mic} title="Transcription" text={lesson.transcript} onCopy={onCopy} />
          <Source icon={Palette} title="Notes Canva" text={lesson.canva} onCopy={onCopy} />
        </>
      )}
      <Options options={lesson.generation_options} />
    </div>
  )
}
