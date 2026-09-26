import styles from '@/components/auth/AuthScreen.module.css'

/**
 * Full-page playful backdrop (soft colors + decorative shapes) with one centered
 * card. Used by /login, the /auth/callback error state and the 404 page.
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
        <span className={`${styles.emoji} ${styles.emojiA}`}>🥐</span>
        <span className={`${styles.emoji} ${styles.emojiB}`}>💬</span>
        <span className={`${styles.emoji} ${styles.emojiC}`}>✨</span>
      </div>
      <main className={styles.main}>
        <section className={styles.card} aria-labelledby={labelledBy}>
          {children}
        </section>
      </main>
    </div>
  )
}

/**
 * Emoji tile + title + subtitle at the top of the card.
 * @param {{ id?: string, emoji?: string, tone?: 'blue'|'green'|'orange'|'pink'|'purple'|'red', title: React.ReactNode, subtitle?: React.ReactNode }} props
 */
export function AuthHeader({ id, emoji = '🇫🇷', tone = 'blue', title, subtitle }) {
  return (
    <header className={styles.header}>
      <span className={`${styles.tile} ${styles[tone] || ''}`} aria-hidden="true">
        {emoji}
      </span>
      <h1 id={id} className={styles.title}>
        {title}
      </h1>
      {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
    </header>
  )
}
