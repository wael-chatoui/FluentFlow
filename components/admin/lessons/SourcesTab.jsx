import { formatNumber } from '@/components/admin/common/format'
import admin from '@/components/admin/common/admin.module.css'
import styles from '@/components/admin/lessons/editor.module.css'

function Source({ icon, title, text, onCopy }) {
  const value = (text || '').trim()
  return (
    <section className={admin.section}>
      <div className={admin.sectionHead}>
        <h2 className={admin.sectionTitle}>
          <span aria-hidden="true">{icon}</span> {title}
        </h2>
        <div className={styles.inlineEnd}>
          <span className={admin.sectionSub}>{value ? `${formatNumber(value.length)} caractères` : 'vide'}</span>
          {value && (
            <button type="button" className={styles.insertBtn} onClick={() => onCopy(value, `${title} copiée.`)}>
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
        <p className={styles.emptyRows}>Rien n&apos;a été collé ici.</p>
      )}
    </section>
  )
}

/** "Sources" tab: read-only transcript + Canva notes with copy buttons. */
export default function SourcesTab({ lesson, onCopy }) {
  return (
    <div className={admin.stack}>
      <Source icon="🎙️" title="Transcription" text={lesson.transcript} onCopy={onCopy} />
      <Source icon="🎨" title="Notes Canva" text={lesson.canva} onCopy={onCopy} />
    </div>
  )
}
