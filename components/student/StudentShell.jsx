import { useMemo } from 'react'
import { BookOpen, House, Library, RotateCcw, User } from 'lucide-react'
import { useAuth } from '@/components/AuthProvider'
import Shell from '@/components/ui/Shell'
import useMe from '@/components/student/useMe'
import useLessons from '@/components/student/useLessons'
import { plural } from '@/components/lesson/format'
import styles from '@/components/student/StudentShell.module.css'

const TABS = [
  { href: '/student', label: 'Home', icon: House, match: (p) => p === '/student' },
  { href: '/student/lessons', label: 'Lessons', icon: BookOpen, match: (p) => p.startsWith('/student/lessons') },
  { href: '/student/review', label: 'Review', icon: RotateCcw, match: (p) => p.startsWith('/student/review') },
  { href: '/student/vocabulary', label: 'Words', icon: Library, match: (p) => p.startsWith('/student/vocabulary') },
  { href: '/student/profile', label: 'Profile', icon: User, match: (p) => p.startsWith('/student/profile') },
]

// The badge only needs a recent count: reuse the cached list for a few minutes
const BADGE_MAX_AGE = 3 * 60 * 1000

// Mistakes to fix, as a badge on the Review tab icon (the count is read in the label)
function withReviewBadge(tabs, count) {
  if (!count) return tabs
  return tabs.map((tab) =>
    tab.href === '/student/review'
      ? {
          ...tab,
          icon: (
            <span className={styles.iconWrap}>
              {tab.icon}
              <span className={styles.badge}>{count > 99 ? '99+' : count}</span>
            </span>
          ),
          label: (
            <>
              {tab.label}
              <span className="sr-only"> ({plural(count, 'mistake')} to fix)</span>
            </>
          ),
        }
      : tab
  )
}

/**
 * Page chrome for every student page (except the full-screen practice player).
 * Also sends students who shouldn't be here yet to the right page (see useMe).
 * @param {{ children: React.ReactNode, wide?: boolean }} props
 */
export default function StudentShell({ children, wide = false }) {
  const { user } = useAuth()
  const { me } = useMe()
  const { data } = useLessons({ maxAge: BADGE_MAX_AGE })
  const mistakeCount = Math.max(0, Number(data?.mistakeCount) || 0)
  const tabs = useMemo(() => withReviewBadge(TABS, mistakeCount), [mistakeCount])

  // profiles.full_name is the source of truth (the session's user_metadata can lag behind)
  const name = me?.profile?.full_name || user?.user_metadata?.full_name || user?.email?.split('@')[0] || ''

  return (
    <Shell
      tabs={tabs}
      homeHref="/student"
      avatar={{ initial: (name.trim()[0] || '?').toUpperCase(), href: '/student/profile', label: 'Profile' }}
      wide={wide}
    >
      {children}
    </Shell>
  )
}
