import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '@/components/AuthProvider'

/**
 * Shared page chrome: sticky header (brand, user, sign out) + centered main column.
 * @param {{ title?: string, back?: { href: string, label: string }, actions?: React.ReactNode, children: React.ReactNode, wide?: boolean }} props
 */
export default function AppShell({ title, back, actions, children, wide = false }) {
  const router = useRouter()
  const { user, role, signOut } = useAuth()

  const displayName = user?.user_metadata?.full_name || user?.email?.split('@')[0] || ''
  const initials = (displayName || '?')
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
  const home = role === 'teacher' ? '/teacher' : '/student'

  const handleSignOut = async () => {
    await signOut()
    router.replace('/login')
  }

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <Link href={home} className="dashboard-brand" aria-label="Home">
            <span className="dashboard-brand-icon">🇫🇷</span>
            <h2>Preply Lessons</h2>
            {role === 'teacher' && <span className="badge badge-blue app-shell-role">Prof</span>}
          </Link>
          <div className="dashboard-user">
            <div className="dashboard-user-info">
              <div className="dashboard-user-name">{displayName}</div>
            </div>
            <div className="dashboard-avatar" aria-hidden="true">{initials}</div>
            <button onClick={handleSignOut} className="btn btn-ghost btn-sm">
              {role === 'teacher' ? 'Déconnexion' : 'Sign out'}
            </button>
          </div>
        </div>
      </header>

      <main className="dashboard-main" style={wide ? undefined : { maxWidth: 960 }}>
        {back && (
          <Link href={back.href} className="app-shell-back">
            ← {back.label}
          </Link>
        )}
        {(title || actions) && (
          <div className="app-shell-titlebar">
            {title && <h1 className="dashboard-title">{title}</h1>}
            {actions && <div className="app-shell-actions">{actions}</div>}
          </div>
        )}
        {children}
      </main>
    </div>
  )
}
