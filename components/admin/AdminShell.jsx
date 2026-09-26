import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '@/components/AuthProvider'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/admin/AdminShell.module.css'

export const ADMIN_NAV = [
  { href: '/admin', label: 'Tableau de bord', icon: '📊', match: (p) => p === '/admin' },
  { href: '/admin/users', label: 'Utilisateurs', icon: '👥', match: (p) => p.startsWith('/admin/users') },
  { href: '/admin/lessons', label: 'Leçons', icon: '📚', match: (p) => p.startsWith('/admin/lessons') },
  { href: '/admin/tables', label: 'Tables', icon: '🗄️', match: (p) => p.startsWith('/admin/tables') },
  { href: '/admin/audit', label: 'Journal', icon: '🧾', match: (p) => p.startsWith('/admin/audit') },
]

/**
 * Back-office chrome: fixed sidebar on desktop (≥ 1024px), top bar + slide-over
 * menu on smaller screens. French UI.
 * @param {{ title: string, actions?: React.ReactNode, children: React.ReactNode }} props
 */
export default function AdminShell({ title, actions, children }) {
  const router = useRouter()
  const { user, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)

  // Close the mobile menu on navigation / Escape
  useEffect(() => {
    setMenuOpen(false)
  }, [router.asPath])

  useEffect(() => {
    if (!menuOpen) return undefined
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [menuOpen])

  const handleSignOut = async () => {
    await signOut()
    router.replace('/login')
  }

  const nav = (
    <nav className={styles.nav} aria-label="Back office">
      {ADMIN_NAV.map((item) => {
        const active = item.match(router.pathname)
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`${styles.navLink} ${active ? styles.active : ''}`}
            aria-current={active ? 'page' : undefined}
          >
            <span className={styles.navIcon} aria-hidden="true">{item.icon}</span>
            {item.label}
          </Link>
        )
      })}
    </nav>
  )

  const footer = (
    <div className={styles.sideFooter}>
      <a href="/teacher" className={styles.footerLink}>
        <span aria-hidden="true">↩</span> Espace prof
      </a>
      <div className={styles.me}>
        <span className={styles.meEmail}>{user?.email}</span>
        <button type="button" className={styles.signOut} onClick={handleSignOut}>
          Se déconnecter
        </button>
      </div>
    </div>
  )

  return (
    <div className={`${ui.theme} ${styles.shell}`}>
      <Head>
        <title>{`${title} · Back office`}</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>

      <aside className={styles.sidebar}>
        <Link href="/admin" className={styles.brand}>
          <span className={styles.brandIcon} aria-hidden="true">🛠️</span>
          <span>
            <strong>Back office</strong>
            <small>Preply Lessons</small>
          </span>
        </Link>
        {nav}
        {footer}
      </aside>

      <header className={styles.mobileBar}>
        <button
          type="button"
          className={styles.menuBtn}
          onClick={() => setMenuOpen(true)}
          aria-label="Ouvrir le menu"
          aria-expanded={menuOpen}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
          </svg>
        </button>
        <strong className={styles.mobileTitle}>🛠️ Back office</strong>
      </header>

      {menuOpen && (
        <div className={styles.overlay} onClick={() => setMenuOpen(false)}>
          <div
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            onClick={(e) => e.stopPropagation()}
          >
            {nav}
            {footer}
          </div>
        </div>
      )}

      <main className={styles.main}>
        <div className={styles.titleBar}>
          <h1 className={styles.title}>{title}</h1>
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
        {children}
      </main>
    </div>
  )
}
