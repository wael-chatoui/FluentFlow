import { useEffect, useRef, useState } from 'react'
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

const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Link to the teacher area. On the back-office host (another origin than
 * NEXT_PUBLIC_SITE_URL) a relative /teacher would be sent back to /admin by the
 * proxy, so it points to the main app instead.
 */
function useTeacherHref() {
  const [href, setHref] = useState('/teacher')
  useEffect(() => {
    const site = (process.env.NEXT_PUBLIC_SITE_URL || '').trim()
    if (!site) return
    try {
      const origin = new URL(site).origin
      if (origin !== window.location.origin) setHref(`${origin}/teacher`)
    } catch {
      // Malformed NEXT_PUBLIC_SITE_URL: keep the relative link
    }
  }, [])
  return href
}

/**
 * Mobile menu as a modal dialog: focus moves to its first link, Tab stays inside,
 * Escape closes it, the page behind does not scroll, and focus returns to the menu
 * button when it closes.
 */
function useDrawerFocus(open, onClose, drawerRef, triggerRef) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => {
    if (!open) return undefined
    const drawer = drawerRef.current
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    drawer?.querySelector(FOCUSABLE)?.focus()

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeRef.current()
        return
      }
      if (e.key !== 'Tab' || !drawer) return
      const items = Array.from(drawer.querySelectorAll(FOCUSABLE))
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      const outside = !drawer.contains(document.activeElement)
      if (e.shiftKey && (outside || document.activeElement === first)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && (outside || document.activeElement === last)) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      // The drawer is gone: focus would otherwise fall back to <body>
      const trigger = triggerRef.current
      const active = document.activeElement
      if (trigger && (!active || active === document.body || drawer?.contains(active))) trigger.focus()
    }
  }, [open, drawerRef, triggerRef])
}

/**
 * Back-office chrome: fixed sidebar on desktop (≥ 1024px), top bar + slide-over
 * menu on smaller screens. French UI.
 * @param {{ title: string, actions?: React.ReactNode, children: React.ReactNode }} props
 */
export default function AdminShell({ title, actions, children }) {
  const router = useRouter()
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuButtonRef = useRef(null)
  const drawerRef = useRef(null)
  const teacherHref = useTeacherHref()

  // Close the mobile menu on navigation
  useEffect(() => {
    setMenuOpen(false)
  }, [router.asPath])

  useDrawerFocus(menuOpen, () => setMenuOpen(false), drawerRef, menuButtonRef)

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
      <a href={teacherHref} className={styles.footerLink}>
        <span aria-hidden="true">↩</span> Espace prof
      </a>
      <div className={styles.me}>
        <span className={styles.meEmail}>{user?.email}</span>
        {/* Same sign-out as the teacher area: /logout works on every host (all devices) */}
        <Link href="/logout?from=admin" prefetch={false} className={styles.signOut}>
          Se déconnecter
        </Link>
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
          ref={menuButtonRef}
          type="button"
          className={styles.menuBtn}
          onClick={() => setMenuOpen(true)}
          aria-label="Ouvrir le menu"
          aria-expanded={menuOpen}
          aria-controls="admin-drawer"
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
            ref={drawerRef}
            id="admin-drawer"
            className={styles.drawer}
            role="dialog"
            aria-modal="true"
            aria-label="Menu du back office"
            onClick={(e) => {
              e.stopPropagation()
              // A link to the page already shown leaves asPath unchanged (no close on navigation)
              if (e.target.closest('a[href]')) setMenuOpen(false)
            }}
          >
            {nav}
            {footer}
            <button type="button" className={styles.drawerClose} onClick={() => setMenuOpen(false)}>
              Fermer le menu
            </button>
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
