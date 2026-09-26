import styles from '@/components/teacher/lessons/lessonUi.module.css'

const TONES = {
  blue: 'var(--st-blue-bg)',
  green: 'var(--st-green-bg)',
  orange: 'var(--st-orange-bg)',
  purple: 'var(--st-purple-bg)',
}

/** Friendly empty panel: emoji tile, title, text. */
export default function EmptyNote({ emoji, title, text, tone = 'blue' }) {
  return (
    <div className={styles.empty} style={{ '--empty-bg': TONES[tone] || TONES.blue }}>
      <span className={styles.emptyEmoji} aria-hidden="true">{emoji}</span>
      <p className={styles.emptyTitle}>{title}</p>
      {text && <p className={styles.emptyText}>{text}</p>}
    </div>
  )
}
