import styles from '@/components/teacher/lessons/LessonSources.module.css'

function Source({ title, icon, tone, text, open }) {
  const value = (text || '').trim()
  const n = value.length.toLocaleString('fr-FR')
  return (
    <details className={`${styles.source} ${styles[tone]}`} open={open}>
      <summary className={styles.summary}>
        <span className={styles.icon} aria-hidden="true">{icon}</span>
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
      {value ? (
        <div className={styles.text}>{value}</div>
      ) : (
        <p className={styles.empty}>Rien n&apos;a été collé ici.</p>
      )}
    </details>
  )
}

/** Read-only transcript + Canva notes as collapsible cards (line breaks preserved). */
export default function LessonSources({ transcript, canva, aiModel, defaultOpen = false }) {
  return (
    <div className={styles.sources}>
      <Source title="Transcription" icon="🎙️" tone="blue" text={transcript} open={defaultOpen} />
      <Source title="Notes Canva" icon="🎨" tone="pink" text={canva} open={defaultOpen} />
      {aiModel && (
        <p className={styles.aiModel}>
          <span aria-hidden="true">🤖</span> Modèle IA : {aiModel}
        </p>
      )}
    </div>
  )
}
