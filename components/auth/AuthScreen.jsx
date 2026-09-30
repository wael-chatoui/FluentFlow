import { Croissant, Languages, MessageCircle, Sparkles } from 'lucide-react'
import Icon from '@/components/ui/Icon'
import styles from '@/components/auth/AuthScreen.module.css'

/**
 * Full-page playful backdrop (soft colors + decorative shapes) with one centered
 * card. Used by /login, the /auth/* landing states, /pending, /join, /admin/forbidden and 404.
 *
 * @param {{ children: React.ReactNode, labelledBy?: string }} props
 */
export default function AuthScreen({ children, labelledBy }) {
  return (
    <div className={styles.page}>
      <div className={styles.decor} aria-hidden="true">
        <span className={`${styles.shape} ${styles.sun}`} />
        <span className={`${styles.shape} ${styles.pinkBlock}`} />
        <span className={`${styles.shape} ${styles.ring}`} />
        <span className={`${styles.shape} ${styles.blueDot}`} />
        <span className={`${styles.shape} ${styles.greenBlock}`} />
        <span className={`${styles.emoji} ${styles.emojiA}`}>
          <Icon icon={Croissant} size="1em" />
        </span>
        <span className={`${styles.emoji} ${styles.emojiB}`}>
          <Icon icon={MessageCircle} size="1em" />
        </span>
        <span className={`${styles.emoji} ${styles.emojiC}`}>
          <Icon icon={Sparkles} size="1em" />
        </span>
      </div>
      <main className={styles.main}>
        <section className={styles.card} aria-labelledby={labelledBy}>
          {children}
        </section>
      </main>
    </div>
  )
}

// A lucide component (function or forwardRef object), not a string / element
const isIconComponent = (value) =>
  typeof value === 'function' || (value && typeof value === 'object' && !('props' in value) && '$$typeof' in value)

/**
 * Pictogram tile + title + subtitle at the top of the card.
 * `icon`: a lucide-react component (e.g. `icon={KeyRound}`). `emoji` is the legacy
 * prop (a string or an element; a lucide component is accepted there too).
 * @param {{ id?: string, icon?: React.ComponentType, emoji?: React.ReactNode,
 *   tone?: 'blue'|'green'|'orange'|'pink'|'purple'|'red', title: React.ReactNode, subtitle?: React.ReactNode }} props
 */
export function AuthHeader({ id, icon, emoji, tone = 'blue', title, subtitle }) {
  const glyph = icon || (isIconComponent(emoji) ? emoji : null) || (emoji == null ? Languages : null)
  return (
    <header className={styles.header}>
      <span className={`${styles.tile} ${styles[tone] || ''}`} aria-hidden="true">
        {glyph ? <Icon icon={glyph} size="0.9em" /> : emoji}
      </span>
      <h1 id={id} className={styles.title}>
        {title}
      </h1>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </header>
  )
}
