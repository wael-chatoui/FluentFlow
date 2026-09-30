import { useId, useMemo } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import StudentShell from '@/components/student/StudentShell'
import useMe from '@/components/student/useMe'
import useLessons from '@/components/student/useLessons'
import UpNextCard, { UpNextSkeleton } from '@/components/student/home/UpNextCard'
import ProgressCard, { ProgressSkeleton } from '@/components/student/home/ProgressCard'
import { computeUpNext } from '@/components/student/home/upNext'
import LessonCard, { LessonCardSkeleton } from '@/components/student/lessons/LessonCard'
import { ErrorCard } from '@/components/student/lessons/StatusViews'
import { progressStats, scoreHistory, sortNewestFirst } from '@/components/student/lessons/progress'
import { levelShort } from '@/utils/profile/levels'
import { plural } from '@/components/lesson/format'
import { safeHttpsUrl } from '@/utils/lesson/schema'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/student/home/Home.module.css'
import { BookOpenText, ChevronRight, Dumbbell, Folder, Languages, RotateCcw, Speech } from 'lucide-react'
import Icon from '@/components/ui/Icon'

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || ''
}

function MistakesCard({ count }) {
  return (
    <Link href="/student/review" className={styles.mistakes}>
      <span className={styles.mistakesIcon} aria-hidden="true">
        <Icon icon={RotateCcw} size={26} />
      </span>
      <span className={styles.mistakesText}>
        <span className={styles.mistakesTitle}>{plural(count, 'mistake')} to fix</span>
        <span className={styles.mistakesSub}>Turn them into wins in a quick review</span>
      </span>
      <span className={styles.chevron} aria-hidden="true">
        <Icon icon={ChevronRight} size={28} strokeWidth={3} />
      </span>
    </Link>
  )
}

function HowItWorks() {
  const steps = [
    { icon: Speech, text: 'Take your class with Wael on Preply' },
    { icon: BookOpenText, text: 'Get a recap of everything you covered' },
    { icon: Dumbbell, text: 'Practice with fun exercises' },
  ]
  return (
    <section className={`${ui.card} ${styles.how}`} aria-labelledby="how-title">
      <h2 id="how-title" className={styles.howTitle}>
        How it works
      </h2>
      <ol className={styles.howList}>
        {steps.map((s, i) => (
          <li key={i} className={styles.howStep}>
            <span className={styles.howEmoji} aria-hidden="true">
              <Icon icon={s.icon} size={22} />
            </span>
            <span>{s.text}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

export default function StudentHome() {
  const { user } = useAuth()
  const recentId = useId()
  const { me, error: meError } = useMe()
  const { data, error, loading, reload } = useLessons()

  const lessons = useMemo(() => sortNewestFirst(data?.lessons), [data])
  const mistakeCount = Math.max(0, Number(data?.mistakeCount) || 0)
  const upNext = useMemo(() => computeUpNext(lessons, mistakeCount), [lessons, mistakeCount])
  const stats = useMemo(() => progressStats(lessons, data?.wordCount), [lessons, data])
  const history = useMemo(() => scoreHistory(lessons, 8), [lessons])

  const profile = me?.profile || null
  // The session's name is only a fallback when /api/me failed (it can lag behind the profile)
  const first = firstName(profile?.full_name || (meError ? user?.user_metadata?.full_name || user?.user_metadata?.name : ''))
  const level = levelShort(profile?.level)
  const driveUrl = safeHttpsUrl(data?.driveFolderUrl)
  const greetingLoading = !me && !meError
  const failed = !data && Boolean(error)
  const hasLessons = lessons.length > 0

  return (
    <StudentShell wide>
      <Head>
        <title>Home · Preply Lessons</title>
      </Head>

      <header className={styles.greeting}>
        {greetingLoading ? (
          <div>
            <h1 className="sr-only">Home</h1>
            <span className={ui.skel} style={{ width: 240, maxWidth: '80%', height: 34 }} aria-hidden="true" />
            <span className={ui.skel} style={{ width: 170, height: 28, marginTop: 10, borderRadius: 999 }} aria-hidden="true" />
          </div>
        ) : (
          <>
            <h1 className={styles.hello}>
              Bonjour{first ? `, ${first}` : ''}!
            </h1>
            <div className={styles.greetMeta}>
              {level && (
                <span className={`${ui.pill} ${styles.levelPill}`}>
                  <Icon icon={Languages} size={16} />
                  <span className="sr-only">Your French level: </span>
                  {level}
                </span>
              )}
              <span className={styles.tagline}>Ready for some French?</span>
            </div>
          </>
        )}
        {loading && <span className="sr-only" role="status">Loading your lessons…</span>}
      </header>

      {failed ? (
        <ErrorCard title="Couldn’t load your lessons" message={error.message} onRetry={reload} />
      ) : (
        <div className={styles.layout}>
          <div className={styles.primary}>
            <div className={styles.oHero}>{loading ? <UpNextSkeleton /> : <UpNextCard upNext={upNext} />}</div>

            {!loading && mistakeCount > 0 && upNext.kind !== 'mistakes' && (
              <div className={styles.oMistakes}>
                <MistakesCard count={mistakeCount} />
              </div>
            )}

            {(loading || hasLessons) && (
              <section className={styles.oRecent} aria-labelledby={recentId} aria-busy={loading}>
                <div className={styles.sectionHead}>
                  <h2 id={recentId} className={`${ui.sectionTitle} ${styles.sectionTitle}`}>
                    Recent lessons
                  </h2>
                  <Link href="/student/lessons" className={styles.seeAll}>
                    See all lessons
                    <Icon icon={ChevronRight} size={18} strokeWidth={3} />
                  </Link>
                </div>
                <ul className={styles.list}>
                  {loading ? (
                    <>
                      <LessonCardSkeleton />
                      <LessonCardSkeleton />
                      <LessonCardSkeleton />
                    </>
                  ) : (
                    lessons.slice(0, 3).map((lesson, i) => (
                      <LessonCard key={lesson.id} lesson={lesson} index={i} headingLevel={3} />
                    ))
                  )}
                </ul>
              </section>
            )}
          </div>

          <div className={styles.aside}>
            {loading ? (
              <div className={styles.oProgress}>
                <ProgressSkeleton />
              </div>
            ) : hasLessons ? (
              <div className={styles.oProgress}>
                <ProgressCard stats={stats} history={history} />
              </div>
            ) : (
              <div className={styles.oProgress}>
                <HowItWorks />
              </div>
            )}

            {!loading && driveUrl && (
              <div className={styles.oDrive}>
                <a
                  href={driveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`${ui.btn} ${ui.ghost} ${ui.block}`}
                >
                  <Icon icon={Folder} size={20} /> My Google Drive folder
                  <span className="sr-only"> (opens in a new tab)</span>
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </StudentShell>
  )
}
