import { useEffect, useState } from 'react'
import styles from '@/components/ui/LoadingScreen.module.css'

const DEFAULT_LABEL = { en: 'Loading…', fr: 'Chargement…' }

/**
 * Full-page loading state: a bouncing 🇫🇷 tile + three brand-colored dots.
 * Fades in after a short delay so fast loads don't flash.
 *
 * The text is inserted into the live region after mount: screen readers only
 * announce content that changes inside an existing role="status" region.
 *
 * @param {{ label?: string, message?: string }} props
 *   label: screen-reader text when there is no visible message
 *          (default "Loading…", or "Chargement…" on French pages).
 *   message: optional visible text under the dots (also announced).
 */
export default function LoadingScreen({ label, message = '' }) {
  const [text, setText] = useState('')

  useEffect(() => {
    const lang = /^fr/i.test(document.documentElement.lang || '') ? 'fr' : 'en'
    setText(message || label || DEFAULT_LABEL[lang])
  }, [label, message])

  return (
    <div className={styles.screen}>
      <div className={styles.inner}>
        <div className={styles.art} aria-hidden="true">
          <span className={styles.tile}>🇫🇷</span>
          <span className={styles.shadow} />
        </div>
        <span className={styles.dots} aria-hidden="true">
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
        </span>
        <p className={message ? styles.message : 'sr-only'} role="status">
          {text}
        </p>
      </div>
    </div>
  )
}
