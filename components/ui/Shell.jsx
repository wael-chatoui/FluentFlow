import Link from 'next/link'
import { useRouter } from 'next/router'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/ui/Shell.module.css'

/**
 * App chrome shared by the student and teacher areas: top bar with nav on
 * desktop, bottom tab bar on mobile, centered content column.
 *
 * @param {{
 *   tabs: { href: string, label: string, icon: string, match: (pathname: string) => boolean }[],
 *   homeHref: string,
 *   badge?: React.ReactNode,          // small label next to the brand (e.g. "Prof")
 *   avatar: { initial: string, href?: string, label: string, onClick?: () => void },
 *   wide?: boolean,
 *   children: React.ReactNode,
 * }} props
 */
export default function Shell({ tabs, homeHref, badge, avatar, wide = false, children }) {
  const router = useRouter()

  const avatarContent = <span aria-hidden="true">{avatar.initial || '?'}</span>
  const avatarEl = avatar.href ? (
    <Link href={avatar.href} className={styles.avatar} aria-label={avatar.label}>
      {avatarContent}
    </Link>
  ) : (
    <button type="button" className={styles.avatar} aria-label={avatar.label} onClick={avatar.onClick} data-account-trigger="">
      {avatarContent}
    </button>
  )

  return (
    <div className={`${ui.theme} ${styles.shell}`}>
      <header className={`${styles.topbar} no-print`}>
        <div className={styles.topbarInner}>
          <Link href={homeHref} className={styles.brand} aria-label="Home">
            <span className={styles.brandFlag} aria-hidden="true">🇫🇷</span>
            <span className={styles.brandName}>Preply Lessons</span>
            {badge}
          </Link>
          <nav className={styles.topnav} aria-label="Main">
            {tabs.map((tab) => {
              const active = tab.match(router.pathname)
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={`${styles.topnavLink} ${active ? styles.active : ''}`}
                  aria-current={active ? 'page' : undefined}
                >
                  <span aria-hidden="true">{tab.icon}</span> {tab.label}
                </Link>
              )
            })}
          </nav>
          {avatarEl}
        </div>
      </header>

      <main className={`${styles.main} ${wide ? styles.mainWide : ''}`}>{children}</main>

      <nav className={`${styles.tabbar} no-print`} aria-label="Main" style={{ '--tab-count': tabs.length }}>
        {tabs.map((tab) => {
          const active = tab.match(router.pathname)
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`${styles.tab} ${active ? styles.active : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              <span className={styles.tabIcon} aria-hidden="true">{tab.icon}</span>
              <span className={styles.tabLabel}>{tab.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
