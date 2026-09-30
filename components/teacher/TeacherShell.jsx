import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/components/AuthProvider'
import Shell from '@/components/ui/Shell'
import styles from '@/components/teacher/TeacherShell.module.css'

export const TEACHER_TABS = [
  {
    href: '/teacher',
    label: 'Élèves',
    icon: '👥',
    match: (p) => p === '/teacher' || p.startsWith('/teacher/students'),
  },
  {
    href: '/teacher/lessons/new',
    label: 'Nouvelle leçon',
    icon: '✨',
    match: (p) => p.startsWith('/teacher/lessons') && !p.startsWith('/teacher/lessons/import'),
  },
  {
    href: '/teacher/lessons/import',
    label: 'Importer',
    icon: '📥',
    match: (p) => p.startsWith('/teacher/lessons/import'),
  },
]

/**
 * Page chrome for every teacher page (French). The avatar opens a small
 * account menu with "Se déconnecter".
 * @param {{ children: React.ReactNode, wide?: boolean }} props
 */
export default function TeacherShell({ children, wide = false }) {
  const router = useRouter()
  const { user, signOut } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)
  const menuRef = useRef(null)

  const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || ''

  // Close the menu on outside click / Escape
  useEffect(() => {
    if (!menuOpen) return undefined
    const onDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target) && !e.target.closest?.('[data-account-trigger]')) {
        setMenuOpen(false)
      }
    }
    const onKey = (e) => e.key === 'Escape' && setMenuOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])

  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      await signOut()
    } finally {
      router.replace('/login')
    }
  }

  return (
    <Shell
      tabs={TEACHER_TABS}
      homeHref="/teacher"
      wide={wide}
      badge={<span className={styles.badge}>Prof</span>}
      avatar={{
        initial: (name.trim()[0] || 'W').toUpperCase(),
        label: 'Mon compte',
        onClick: () => setMenuOpen((o) => !o),
      }}
    >
      {menuOpen && (
        <div ref={menuRef} className={`${styles.menu} no-print`} role="menu" aria-label="Mon compte">
          <div className={styles.menuHeader}>
            <strong>{name || 'Prof'}</strong>
            {user?.email && <span>{user.email}</span>}
          </div>
          <button type="button" role="menuitem" className={styles.menuItem} onClick={handleSignOut} disabled={signingOut}>
            <span aria-hidden="true">🚪</span> {signingOut ? 'Déconnexion…' : 'Se déconnecter'}
          </button>
        </div>
      )}
      {children}
    </Shell>
  )
}
