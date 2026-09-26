import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import TeacherShell from '@/components/teacher/TeacherShell'
import StudentCard, { StudentCardSkeleton } from '@/components/teacher/StudentCard'
import PageState from '@/components/teacher/PageState'
import StatTiles, { StatTilesSkeleton } from '@/components/teacher/dashboard/StatTiles'
import StudentSearch from '@/components/teacher/dashboard/StudentSearch'
import { api } from '@/utils/apiClient'
import { isAbortError, parseLocalDate, studentDisplayName } from '@/components/teacher/format'
import { useMountedRef } from '@/components/teacher/hooks'
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
  const { user } = useAuth()
  const mounted = useMountedRef()
  const controllerRef = useRef(null)
  const [students, setStudents] = useState(null)
  const [error, setError] = useState(null)
  const [query, setQuery] = useState('')

  const load = useCallback(async () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setError(null)
    setStudents(null)
    try {
      const data = await api('/api/teacher/students', { signal: controller.signal })
      if (!mounted.current || controller.signal.aborted) return
      setStudents(Array.isArray(data.students) ? [...data.students].sort(byRecentLesson) : [])
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      setError(err.message || 'Impossible de charger les élèves.')
    }
  }, [mounted])

  useEffect(() => {
    load()
    return () => controllerRef.current?.abort()
  }, [load])

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

  const loading = !students && !error
  const first = firstName(user?.user_metadata?.full_name || user?.user_metadata?.name)
  const hasStudents = Boolean(students?.length)

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
        <Link href="/teacher/lessons/new" className={`${ui.btn} ${ui.green} ${styles.cta}`}>
          <span aria-hidden="true">✨</span> Nouvelle leçon
        </Link>
      </header>

      {error ? (
        <PageState role="alert" icon="😕" title="Impossible de charger tes élèves" text={error} onRetry={load} />
      ) : (
        <div className={styles.content}>
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
                text="Tes élèves apparaîtront ici dès qu’ils se seront connectés au site."
              />
            ) : filtered.length === 0 ? (
              <PageState
                icon="🔎"
                tone="purple"
                headingLevel={3}
                title="Aucun élève trouvé"
                text={`Aucun nom ni e-mail ne correspond à «\u00a0${query.trim()}\u00a0».`}
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
        </div>
      )}
    </TeacherShell>
  )
}
