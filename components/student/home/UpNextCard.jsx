import { useId } from 'react'
import Link from 'next/link'
import { formatLessonDate, plural } from '@/components/lesson/format'
import { exerciseCount } from '@/components/student/lessons/progress'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/student/home/UpNext.module.css'
import { BookOpenText, Gift, RefreshCw, Rocket, RotateCcw, Sprout, Trophy } from 'lucide-react'
import Icon from '@/components/ui/Icon'

const DATE_OPTS = { weekday: 'long', month: 'long', day: 'numeric' }

const lessonHref = (lesson) => `/student/lessons/${encodeURIComponent(lesson.id)}`

function content(upNext) {
  switch (upNext.kind) {
    case 'new': {
      const { lesson, updated } = upNext
      const date = formatLessonDate(lesson.lesson_date, DATE_OPTS)
      return {
        tone: 'green',
        icon: updated ? RefreshCw : Gift,
        eyebrow: updated ? 'Updated by your teacher' : 'New lesson ready',
        title: lesson.title || 'Your latest lesson',
        text: [date, plural(exerciseCount(lesson), updated ? 'new exercise' : 'exercise')].filter(Boolean).join(' · '),
        primary: { href: `${lessonHref(lesson)}/practice`, label: 'Practice', color: ui.green },
        secondary: { href: lessonHref(lesson), label: 'Read recap' },
      }
    }
    case 'mistakes':
      return {
        tone: 'orange',
        icon: RotateCcw,
        eyebrow: 'Up next',
        title: `${plural(upNext.count, 'mistake')} to fix`,
        text: 'Practice them again so the right answer sticks.',
        primary: { href: '/student/review', label: 'Fix my mistakes', color: ui.orange },
      }
    case 'improve': {
      const { lesson, pct } = upNext
      return {
        tone: 'blue',
        icon: Rocket,
        eyebrow: 'Improve your score',
        title: lesson.title || 'Lesson recap',
        text: `Your best is ${pct}%. Can you beat it?`,
        primary: { href: `${lessonHref(lesson)}/practice`, label: 'Practice again', color: ui.blue },
        secondary: { href: lessonHref(lesson), label: 'Read recap' },
      }
    }
    case 'mastered':
      return {
        tone: 'purple',
        icon: Trophy,
        eyebrow: 'Up next',
        title: 'Everything mastered!',
        text: 'Amazing work. Keep your French fresh by reviewing your words.',
        primary: { href: '/student/vocabulary', label: 'Review your words', color: ui.purple },
      }
    case 'recap': {
      const { lesson } = upNext
      return {
        tone: 'pink',
        icon: BookOpenText,
        eyebrow: 'Your latest recap',
        title: lesson.title || 'Lesson recap',
        text: formatLessonDate(lesson.lesson_date, DATE_OPTS),
        primary: { href: lessonHref(lesson), label: 'Read recap', color: ui.pink },
      }
    }
    default:
      return {
        tone: 'yellow',
        icon: Sprout,
        eyebrow: 'Welcome!',
        title: 'No lessons yet',
        text: 'Your first lesson recap will appear here after your next class with Wael.',
      }
  }
}

/** The single most useful next action (see upNext.js). */
export default function UpNextCard({ upNext }) {
  const titleId = useId()
  const c = content(upNext)

  return (
    <section className={`${styles.hero} ${styles[c.tone]}`} aria-labelledby={titleId}>
      <span className={styles.art} aria-hidden="true">
        <Icon icon={c.icon} size={40} />
      </span>
      <div className={styles.body}>
        <p className={styles.eyebrow}>{c.eyebrow}</p>
        <h2 id={titleId} className={styles.title}>
          {c.title}
        </h2>
        {c.text && <p className={styles.text}>{c.text}</p>}
        {(c.primary || c.secondary) && (
          <div className={styles.actions}>
            {c.primary && (
              <Link href={c.primary.href} className={`${ui.btn} ${c.primary.color} ${styles.primary}`}>
                {c.primary.label}
              </Link>
            )}
            {c.secondary && (
              <Link href={c.secondary.href} className={`${ui.btn} ${ui.ghost} ${styles.secondary}`}>
                {c.secondary.label}
              </Link>
            )}
          </div>
        )}
      </div>
    </section>
  )
}

export function UpNextSkeleton() {
  return (
    <div className={`${styles.hero} ${styles.skeleton}`} aria-hidden="true">
      <span className={`${ui.skel} ${styles.artSkel}`} />
      <div className={styles.body}>
        <span className={ui.skel} style={{ width: 110, height: 12 }} />
        <span className={ui.skel} style={{ width: '80%', height: 26, marginTop: 10 }} />
        <span className={ui.skel} style={{ width: '55%', height: 14, marginTop: 10 }} />
        <div className={styles.actions}>
          <span className={`${ui.skel} ${styles.primary}`} style={{ height: 52, borderRadius: 16 }} />
        </div>
      </div>
    </div>
  )
}
