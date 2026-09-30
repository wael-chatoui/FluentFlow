import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import Shell from '@/components/ui/Shell'
import styles from '@/components/teacher/TeacherShell.module.css'
import { Import, LogOut, Sparkles, Users } from 'lucide-react'
import Icon from '@/components/ui/Icon'

export const TEACHER_TABS = [
  {
    href: '/teacher',
    label: 'Élèves',
    icon: Users,
    // A lesson page belongs to its student: keep "Élèves" current there
    match: (p) => p === '/teacher' || p.startsWith('/teacher/students') || p === '/teacher/lessons/[id]',
  },
  {
    href: '/teacher/lessons/new',
    label: 'Nouvelle leçon',
    icon: Sparkles,
    match: (p) => p === '/teacher/lessons/new',
  },
  {
    href: '/teacher/lessons/import',
    label: 'Importer',
    icon: Import,
    match: (p) => p.startsWith('/teacher/lessons/import'),
  },
]

/**
 * Page chrome for every teacher page (French). The avatar is a menu button
 * (WAI-ARIA menu button pattern): it opens a small account menu with the
 * signed-in identity and « Déconnexion » (→ /logout, signs out everywhere).
 * @param {{ children: React.ReactNode, wide?: boolean }} props
 */
export default function TeacherShell({ children, wide = false }) {
  const { user } = useAuth()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)
  const triggerRef = useRef(null)
  const menuId = useId()
  const identityId = useId()

  const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || ''

  const items = () => Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]') || [])

  const closeMenu = useCallback((returnFocus) => {
    setMenuOpen(false)
    if (returnFocus) triggerRef.current?.focus()
  }, [])

  // Opening moves focus to the first item (keyboard and pointer alike)
  useEffect(() => {
    if (menuOpen) menuRef.current?.querySelector('[role="menuitem"]')?.focus()
  }, [menuOpen])

  // Outside press closes without stealing focus from what was pressed
  useEffect(() => {
    if (!menuOpen) return undefined
    const onDown = (e) => {
      if (menuRef.current?.contains(e.target) || triggerRef.current?.contains(e.target)) return
      closeMenu(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [menuOpen, closeMenu])

  const onTriggerKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const list = items()
      if (menuOpen) list[e.key === 'ArrowUp' ? list.length - 1 : 0]?.focus()
      else setMenuOpen(true)
    } else if (e.key === 'Escape' && menuOpen) {
      e.preventDefault()
      closeMenu(true)
    }
  }

  const onMenuKeyDown = (e) => {
    const list = items()
    const index = list.indexOf(document.activeElement)
    let next = null
    if (e.key === 'ArrowDown') next = list[(index + 1) % list.length]
    else if (e.key === 'ArrowUp') next = list[(index - 1 + list.length) % list.length]
    else if (e.key === 'Home') next = list[0]
    else if (e.key === 'End') next = list[list.length - 1]
    else if (e.key === ' ') {
      // Space activates a menu item like Enter (a link would scroll the page instead)
      e.preventDefault()
      document.activeElement?.click()
      return
    } else if (e.key === 'Escape') {
      e.preventDefault()
      closeMenu(true)
      return
    } else if (e.key === 'Tab') {
      // Tab leaves the menu: remove it now and continue the Tab from its trigger
      flushSync(() => setMenuOpen(false))
      triggerRef.current?.focus()
      return
    }
    if (next) {
      e.preventDefault()
      next.focus()
    }
  }

  const menu = menuOpen ? (
    <div className={`${styles.menu} no-print`}>
      <div id={identityId} className={styles.menuHeader}>
        <strong>{name || 'Prof'}</strong>
        {user?.email && <span>{user.email}</span>}
      </div>
      <div
        ref={menuRef}
        id={menuId}
        role="menu"
        aria-label="Mon compte"
        aria-describedby={identityId}
        onKeyDown={onMenuKeyDown}
      >
        <Link
          href="/logout?from=teacher"
          prefetch={false}
          role="menuitem"
          tabIndex={-1}
          className={styles.menuItem}
          onClick={() => setMenuOpen(false)}
        >
          <Icon icon={LogOut} size={18} /> Déconnexion
        </Link>
      </div>
    </div>
  ) : null

  return (
    <Shell
      tabs={TEACHER_TABS}
      homeHref="/teacher"
      lang="fr"
      wide={wide}
      badge={<span className={styles.badge}>Prof</span>}
      avatar={{
        initial: (name.trim()[0] || 'W').toUpperCase(),
        label: 'Mon compte',
        buttonRef: triggerRef,
        expanded: menuOpen,
        controls: menuId,
        // Closing from the trigger keeps focus on it (Safari doesn't focus clicked buttons)
        onClick: () => (menuOpen ? closeMenu(true) : setMenuOpen(true)),
        onKeyDown: onTriggerKeyDown,
        menu,
      }}
    >
      {children}
    </Shell>
  )
}
