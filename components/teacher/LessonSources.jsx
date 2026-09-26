import styles from '@/components/teacher/LessonPage.module.css'

function Source({ title, text, open }) {
  const value = (text || '').trim()
  return (
    <details className={styles.source} open={open}>
      <summary className={styles.sourceSummary}>
        <span>{title}</span>
        <span className={styles.sourceCount}>
          {value ? `${value.length.toLocaleString('fr-FR')} caractères` : 'vide'}
        </span>
      </summary>
      {value ? (
        <div className={styles.sourceText}>{value}</div>
      ) : (
        <p className={styles.sourceEmpty}>Rien n&apos;a été collé ici.</p>
      )}
    </details>
  )
}

/** Read-only transcript + Canva notes (line breaks preserved). */
export default function LessonSources({ transcript, canva, aiModel, defaultOpen = false }) {
  return (
    <div className={styles.sources}>
      <Source title="Transcription" text={transcript} open={defaultOpen} />
      <Source title="Notes Canva" text={canva} open={defaultOpen} />
      {aiModel && <p className={styles.aiModel}>Modèle IA : {aiModel}</p>}
    </div>
  )
}
