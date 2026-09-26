import Link from 'next/link'
import { useRouter } from 'next/router'
import { Nunito } from 'next/font/google'
import { useAuth } from '@/components/AuthProvider'
import ui from '@/components/student/ui.module.css'
import styles from '@/components/student/StudentShell.module.css'

const nunito = Nunito({ subsets: ['latin', 'latin-ext'], weight: ['500', '700', '800', '900'], display: 'swap' })

export const STUDENT_TABS = [
  { href: '/student', label: 'Home', icon: '🏠', match: (p) => p === '/student' },
  { href: '/student/lessons', label: 'Lessons', icon: '📚', match: (p) => p.startsWith('/student/lessons') },
  { href: '/student/review', label: 'Review', icon: '🎯', match: (p) => p.startsWith('/student/review') },
  { href: '/student/vocabulary', label: 'Words', icon: '🔤', match: (p) => p.startsWith('/student/vocabulary') },
  { href: '/student/profile', label: 'Profile', icon: '👤', match: (p) => p.startsWith('/student/profile') },
]

/**
 * Page chrome for every student page (except the full-screen practice player):
 * top bar with nav on desktop, bottom tab bar on mobile, centered content column.
 * @param {{ children: React.ReactNode, wide?: boolean }} props
 */
export default function StudentShell({ children, wide = false }) {
  const router = useRouter()
  const { user } = useAuth()
  const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || ''
  const initial = (name.trim()[0] || '?').toUpperCase()

  return (
    <div className={`${ui.theme} ${nunito.className} ${styles.shell}`}>
      <header className={`${styles.topbar} no-print`}>
        <div className={styles.topbarInner}>
          <Link href="/student" className={styles.brand} aria-label="Home">
            <span className={styles.brandFlag} aria-hidden="true">🇫🇷</span>
            <span className={styles.brandName}>Preply Lessons</span>
          </Link>
          <nav className={styles.topnav} aria-label="Main">
            {STUDENT_TABS.map((tab) => {
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
          <Link href="/student/profile" className={styles.avatar} aria-label="Profile">
            {initial}
          </Link>
        </div>
      </header>

      <main className={`${styles.main} ${wide ? styles.mainWide : ''}`}>{children}</main>

      <nav className={`${styles.tabbar} no-print`} aria-label="Main">
        {STUDENT_TABS.map((tab) => {
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
