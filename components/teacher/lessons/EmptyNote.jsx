import Icon from '@/components/ui/Icon'
import styles from '@/components/teacher/lessons/lessonUi.module.css'

const TONES = {
  blue: { bg: 'var(--st-blue-bg)', fg: 'var(--st-blue-ink)' },
  green: { bg: 'var(--st-green-bg)', fg: 'var(--st-green-ink)' },
  orange: { bg: 'var(--st-orange-bg)', fg: 'var(--st-orange-ink)' },
  purple: { bg: 'var(--st-purple-bg)', fg: 'var(--st-purple-ink)' },
}

/** Friendly empty panel: pictogram tile (lucide component), title, text. */
export default function EmptyNote({ icon, title, text, tone = 'blue' }) {
  const t = TONES[tone] || TONES.blue
  return (
    <div className={styles.empty} style={{ '--empty-bg': t.bg, '--empty-fg': t.fg }}>
      <span className={styles.emptyEmoji} aria-hidden="true">
        <Icon icon={icon} size={34} />
      </span>
      <p className={styles.emptyTitle}>{title}</p>
      {text && <p className={styles.emptyText}>{text}</p>}
    </div>
  )
}
