import { useEffect, useId, useRef, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Icon from '@/components/ui/Icon'
import { Bookmark, Sparkles } from 'lucide-react'
import styles from './BookmarkPromptDialog.module.css'

const STORAGE_KEY = 'pl:bookmark_prompt_dismissed'

/**
 * Friendly Next.js dialog suggesting that the student bookmarks the site
 * and returns often to practice between classes.
 * Persisted in localStorage so it only appears once per device.
 */
export default function BookmarkPromptDialog() {
  const titleId = useId()
  const descId = useId()
  const [open, setOpen] = useState(false)
  const okBtnRef = useRef(null)

  useEffect(() => {
    // Only show if not previously dismissed
    try {
      const dismissed = localStorage.getItem(STORAGE_KEY)
      if (!dismissed) {
        // Small delay so dashboard finishes loading smoothly
        const timer = setTimeout(() => setOpen(true), 1200)
        return () => clearTimeout(timer)
      }
    } catch {
      // localStorage unavailable or restricted
    }
  }, [])

  const handleDismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1')
    } catch {}
    setOpen(false)
  }

  if (!open) return null

  return (
    <Dialog
      onClose={handleDismiss}
      role="dialog"
      labelledBy={titleId}
      describedBy={descId}
      initialFocusRef={okBtnRef}
      className={styles.dialog}
    >
      <div className={styles.iconWrap} aria-hidden="true">
        <Icon icon={Bookmark} size={32} strokeWidth={2.5} />
      </div>

      <h2 id={titleId} className={styles.title}>
        Keep FluentFlow handy! ⭐
      </h2>

      <p id={descId} className={styles.desc}>
        Bookmark this page so you can easily return and review your notes, practice exercises, and fix mistakes between our classes!
      </p>

      <div className={styles.kbdBox}>
        <span>Quick shortcut:</span>
        <kbd className={styles.kbd}>⌘ Cmd</kbd>
        <span>+</span>
        <kbd className={styles.kbd}>D</kbd>
        <span style={{ margin: '0 4px', opacity: 0.5 }}>/</span>
        <kbd className={styles.kbd}>Ctrl</kbd>
        <span>+</span>
        <kbd className={styles.kbd}>D</kbd>
      </div>

      <button ref={okBtnRef} type="button" className={styles.btn} onClick={handleDismiss}>
        Got it!
      </button>
    </Dialog>
  )
}
