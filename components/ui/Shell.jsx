import Link from 'next/link'
import { useRouter } from 'next/router'
import { Languages } from 'lucide-react'
import Icon from '@/components/ui/Icon'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/ui/Shell.module.css'

const MAIN_ID = 'main-content'

// Chrome labels for assistive tech, in the page language (<html lang> is set per area)
const LABELS = {
  en: { skip: 'Skip to content', nav: 'Main navigation' },
  fr: { skip: 'Aller au contenu', nav: 'Navigation principale' },
}

/**
 * App chrome shared by the student and teacher areas: "Skip to content" link,
 * top bar with nav on desktop, bottom tab bar on mobile, centered content column.
 *
 * The avatar is a link (`href`) or a menu button (`onClick` + `menu`): the menu
 * node is rendered right after the button so it follows it in the tab order.
 *
 * @param {{
 *   tabs: { href: string, label: React.ReactNode, icon: import('lucide-react').LucideIcon, match: (pathname: string) => boolean }[],
 *   homeHref: string,
 *   lang?: 'en' | 'fr',               // language of the chrome labels (default 'en')
 *   badge?: React.ReactNode,          // small label next to the brand (e.g. "Prof")
 *   avatar: {
 *     initial: string, label: string, href?: string,
 *     onClick?: () => void, onKeyDown?: (e: React.KeyboardEvent) => void,
 *     buttonRef?: React.Ref<HTMLButtonElement>, expanded?: boolean, controls?: string,
 *     menu?: React.ReactNode,
 *   },
 *   wide?: boolean,
 *   children: React.ReactNode,
 * }} props
 */
export default function Shell({ tabs, homeHref, lang = 'en', badge, avatar, wide = false, children }) {
  const router = useRouter()
  const labels = LABELS[lang] || LABELS.en

  // Move focus (not just the scroll position) so the next Tab starts in the content.
  // <main> is focusable only for this jump, so clicks inside it keep their usual focus.
  const skipToContent = (e) => {
    const main = document.getElementById(MAIN_ID)
    if (!main) return
    e.preventDefault()
    main.setAttribute('tabindex', '-1')
    main.addEventListener('blur', () => main.removeAttribute('tabindex'), { once: true })
    main.focus({ preventScroll: true })
    main.scrollIntoView()
  }

  const avatarContent = <span aria-hidden="true">{avatar.initial || '?'}</span>
  const avatarEl = avatar.href ? (
    <Link href={avatar.href} className={styles.avatar} aria-label={avatar.label}>
      {avatarContent}
    </Link>
  ) : (
    <div className={styles.avatarWrap}>
      <button
        ref={avatar.buttonRef}
        type="button"
        className={styles.avatar}
        aria-label={avatar.label}
        aria-haspopup={avatar.menu !== undefined ? 'menu' : undefined}
        aria-expanded={avatar.menu !== undefined ? Boolean(avatar.expanded) : undefined}
        aria-controls={avatar.expanded ? avatar.controls : undefined}
        onClick={avatar.onClick}
        onKeyDown={avatar.onKeyDown}
      >
        {avatarContent}
      </button>
      {avatar.menu}
    </div>
  )

  return (
    <div className={`${ui.theme} ${styles.shell}`}>
      <a href={`#${MAIN_ID}`} className={`${styles.skipLink} no-print`} onClick={skipToContent}>
        {labels.skip}
      </a>
      <header className={`${styles.topbar} no-print`}>
        <div className={styles.topbarInner}>
          {/* No aria-label: the visible "Preply Lessons" (+ badge) is the link name */}
          <Link href={homeHref} className={styles.brand}>
            <span className={styles.brandFlag} aria-hidden="true">
              <Icon icon={Languages} size={18} strokeWidth={2.5} />
            </span>
            <span className={styles.brandName}>Preply Lessons</span>
            {badge}
          </Link>
          <nav className={styles.topnav} aria-label={labels.nav}>
            {tabs.map((tab) => {
              const active = tab.match(router.pathname)
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`${styles.topnavLink} ${active ? styles.active : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <Icon icon={tab.icon} size={20} /> {tab.label}
                </Link>
              )
            })}
          </nav>
          {avatarEl}
        </div>
      </header>

      <main id={MAIN_ID} className={`${styles.main} ${wide ? styles.mainWide : ''}`}>
        {children}
      </main>

      <nav className={`${styles.tabbar} no-print`} aria-label={labels.nav} style={{ '--tab-count': tabs.length }}>
        {tabs.map((tab) => {
          const active = tab.match(router.pathname)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`${styles.tab} ${active ? styles.active : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className={styles.tabIcon} aria-hidden="true">
                <Icon icon={tab.icon} size={24} />
              </span>
              <span className={styles.tabLabel}>{tab.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
