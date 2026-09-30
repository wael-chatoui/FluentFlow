import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '@/components/AuthProvider'
import TeacherShell from '@/components/teacher/TeacherShell'
import StudentCard, { StudentCardSkeleton } from '@/components/teacher/StudentCard'
import PageState from '@/components/teacher/PageState'
import AttentionPanel from '@/components/teacher/dashboard/AttentionPanel'
import InviteDialog from '@/components/teacher/dashboard/InviteDialog'
import { InactiveStudents, RecentActivity } from '@/components/teacher/dashboard/OverviewLists'
import StatTiles, { StatTilesSkeleton } from '@/components/teacher/dashboard/StatTiles'
import StudentSearch from '@/components/teacher/dashboard/StudentSearch'
import { parseLocalDate, studentDisplayName } from '@/components/teacher/format'
import { useApiResource } from '@/components/teacher/hooks'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/teacher/Dashboard.module.css'

// Case- and accent-insensitive search
function normalize(text) {
  return (text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function byRecentLesson(a, b) {
  const da = a.last_lesson_date || ''
  const db = b.last_lesson_date || ''
  if (da !== db) return da < db ? 1 : -1
  return studentDisplayName(a).localeCompare(studentDisplayName(b), 'fr')
}

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || ''
}

export default function TeacherDashboard() {
  const router = useRouter()
  const { user } = useAuth()
  const studentsRes = useApiResource('/api/teacher/students', { errorMessage: 'Impossible de charger les élèves.' })
  const overviewRes = useApiResource('/api/teacher/overview', { errorMessage: 'Impossible de charger le suivi.' })
  const [query, setQuery] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)

  // /teacher?invite=1 (e.g. from the empty student picker) opens the invitation dialog
  useEffect(() => {
    if (!router.isReady || router.query.invite !== '1') return
    setInviteOpen(true)
    router.replace('/teacher', undefined, { shallow: true })
  }, [router])

  const students = useMemo(
    () => (Array.isArray(studentsRes.data?.students) ? [...studentsRes.data.students].sort(byRecentLesson) : null),
    [studentsRes.data]
  )

  const stats = useMemo(() => {
    if (!students) return null
    const now = new Date()
    const seenThisMonth = students.filter((s) => {
      const d = parseLocalDate(s.last_lesson_date)
      return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
    }).length
    return {
      students: students.length,
      lessons: students.reduce((sum, s) => sum + (s.lesson_count || 0), 0),
      seenThisMonth,
    }
  }, [students])

  const filtered = useMemo(() => {
    if (!students) return []
    const q = normalize(query)
    if (!q) return students
    return students.filter((s) => normalize(`${s.full_name || ''} ${s.email || ''}`).includes(q))
  }, [students, query])

  // Background refresh after an invitation / approval (keeps the grid and the search)
  const refreshStudents = () => studentsRes.refresh().catch(() => {})
  const loading = studentsRes.loading
  const first = firstName(user?.user_metadata?.full_name || user?.user_metadata?.name)
  const hasStudents = Boolean(students?.length)
  const overview = overviewRes.data

  return (
    <TeacherShell wide>
      <Head>
        <title>Mes élèves — Preply Lessons</title>
      </Head>

      <header className={styles.header}>
        <div className={styles.greeting}>
          <h1 className={styles.hello}>
            Bonjour{first ? ` ${first}` : ''} <span aria-hidden="true">👋</span>
          </h1>
          <p className={styles.tagline}>Prêt à préparer la prochaine leçon ?</p>
        </div>
        <div className={styles.ctas}>
          <button type="button" className={`${ui.btn} ${ui.ghost} ${styles.cta}`} onClick={() => setInviteOpen(true)}>
            <span aria-hidden="true">✉️</span> Inviter un élève
          </button>
          <Link href="/teacher/lessons/new" className={`${ui.btn} ${ui.green} ${styles.cta}`}>
            <span aria-hidden="true">✨</span> Nouvelle leçon
          </Link>
        </div>
      </header>

      <div className={styles.content}>
        <AttentionPanel
          overview={overview}
          loading={overviewRes.loading}
          error={overviewRes.error}
          onRetry={overviewRes.reload}
          onUpdate={(updater) => overviewRes.setData((o) => (o ? updater(o) : o))}
          onRefresh={() => overviewRes.refresh().catch(() => {})}
          onStudentsChanged={refreshStudents}
        />

        <div className={styles.columns}>
          <InactiveStudents items={overviewRes.error ? null : overview?.inactive || []} loading={overviewRes.loading} />
          <RecentActivity items={overviewRes.error ? null : overview?.activity || []} loading={overviewRes.loading} />
        </div>

        {studentsRes.error ? (
          <PageState
            role="alert"
            icon="😕"
            title="Impossible de charger tes élèves"
            text={studentsRes.error}
            onRetry={studentsRes.reload}
          />
        ) : (
          <>
            {loading ? <StatTilesSkeleton /> : <StatTiles stats={stats} />}

            <section aria-labelledby="students-title" aria-busy={loading}>
              <div className={styles.sectionHead}>
                <div className={styles.titleRow}>
                  <h2 id="students-title" className={`${ui.sectionTitle} ${styles.sectionTitle}`}>
                    Mes élèves
                  </h2>
                  {!loading && hasStudents && (
                    <span className={styles.count} role="status" aria-live="polite">
                      {query
                        ? `${filtered.length} résultat${filtered.length > 1 ? 's' : ''}`
                        : `${students.length} élève${students.length > 1 ? 's' : ''}`}
                    </span>
                  )}
                </div>
                {!loading && hasStudents && <StudentSearch value={query} onChange={setQuery} />}
              </div>

              {loading ? (
                <>
                  <span className="sr-only" role="status">Chargement des élèves…</span>
                  <ul className={styles.grid} aria-hidden="true">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <li key={i}>
                        <StudentCardSkeleton />
                      </li>
                    ))}
                  </ul>
                </>
              ) : !hasStudents ? (
                <PageState
                  icon="👋"
                  tone="yellow"
                  headingLevel={3}
                  title="Aucun élève pour l’instant"
                  text="Invite ton premier élève : tu recevras un lien à lui envoyer dans le chat Preply."
                  action={
                    <button type="button" className={`${ui.btn} ${ui.green}`} onClick={() => setInviteOpen(true)}>
                      <span aria-hidden="true">✉️</span> Inviter un élève
                    </button>
                  }
                />
              ) : filtered.length === 0 ? (
                <PageState
                  icon="🔎"
                  tone="purple"
                  headingLevel={3}
                  title="Aucun élève trouvé"
                  text={`Aucun nom ni e-mail ne correspond à « ${query.trim()} ».`}
                  action={
                    <button type="button" className={`${ui.btn} ${ui.ghost}`} onClick={() => setQuery('')}>
                      Effacer la recherche
                    </button>
                  }
                />
              ) : (
                <ul className={styles.grid}>
                  {filtered.map((student, i) => (
                    <li key={student.id}>
                      <StudentCard student={student} index={i} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={refreshStudents}
        pending={overview?.pending || []}
        onApproved={(request) => {
          overviewRes.setData((o) => (o ? { ...o, pending: (o.pending || []).filter((p) => p.id !== request.id) } : o))
          refreshStudents()
        }}
        onEmailExists={() => overviewRes.refresh().catch(() => {})}
      />
    </TeacherShell>
  )
}
