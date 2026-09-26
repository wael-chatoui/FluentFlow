import { useAuth } from '@/components/AuthProvider'
import Shell from '@/components/ui/Shell'

export const STUDENT_TABS = [
  { href: '/student', label: 'Home', icon: '🏠', match: (p) => p === '/student' },
  { href: '/student/lessons', label: 'Lessons', icon: '📚', match: (p) => p.startsWith('/student/lessons') },
  { href: '/student/review', label: 'Review', icon: '🎯', match: (p) => p.startsWith('/student/review') },
  { href: '/student/vocabulary', label: 'Words', icon: '🔤', match: (p) => p.startsWith('/student/vocabulary') },
  { href: '/student/profile', label: 'Profile', icon: '👤', match: (p) => p.startsWith('/student/profile') },
]

/**
 * Page chrome for every student page (except the full-screen practice player).
 * @param {{ children: React.ReactNode, wide?: boolean }} props
 */
export default function StudentShell({ children, wide = false }) {
  const { user } = useAuth()
  const name = user?.user_metadata?.full_name || user?.email?.split('@')[0] || ''

  return (
    <Shell
      tabs={STUDENT_TABS}
      homeHref="/student"
      avatar={{ initial: (name.trim()[0] || '?').toUpperCase(), href: '/student/profile', label: 'Profile' }}
      wide={wide}
    >
      {children}
    </Shell>
  )
}
