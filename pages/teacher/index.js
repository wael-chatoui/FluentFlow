import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import AppShell from '@/components/AppShell'
import { api } from '@/utils/apiClient'
import StudentCard, { StudentCardSkeleton } from '@/components/teacher/StudentCard'
import PageState from '@/components/teacher/PageState'
import Skeleton from '@/components/teacher/Skeleton'
import { isAbortError, parseLocalDate, studentDisplayName } from '@/components/teacher/format'
import { useMountedRef } from '@/components/teacher/hooks'
import shared from '@/components/teacher/Teacher.module.css'
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

export default function TeacherDashboard() {
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

  return (
    <div className={shared.page}>
      <Head>
        <title>Mes élèves — Preply Lessons</title>
      </Head>
      <AppShell
        title="Mes élèves"
        actions={
          <Link href="/teacher/lessons/new" className="btn btn-primary">
            ✨ Nouvelle leçon
          </Link>
        }
      >
        {error ? (
          <PageState
            role="alert"
            title="Impossible de charger tes élèves"
            text={error}
            onRetry={load}
          />
        ) : (
          <>
            <div className={`stats-row ${styles.stats}`} aria-busy={loading}>
              {loading ? (
                [0, 1, 2].map((i) => (
                  <div key={i} className={`stat-card ${styles.statSkeleton}`} aria-hidden="true">
                    <Skeleton width={48} height={28} />
                    <Skeleton width="70%" height={12} />
                  </div>
                ))
              ) : (
                <>
                  <div className="stat-card">
                    <div className="stat-value">{stats.students}</div>
                    <div className="stat-label">{stats.students > 1 ? 'Élèves' : 'Élève'}</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{stats.lessons}</div>
                    <div className="stat-label">Leçons au total</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">{stats.seenThisMonth}</div>
                    <div className="stat-label">Élèves vus ce mois-ci</div>
                  </div>
                </>
              )}
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
            ) : students.length === 0 ? (
              <div className="dashboard-section">
                <div className="empty-state">
                  <div className="empty-state-icon" aria-hidden="true">👋</div>
                  <div className="empty-state-title">Aucun élève pour l&apos;instant</div>
                  <div className="empty-state-text">
                    Tes élèves apparaîtront ici dès qu&apos;ils se seront connectés au site.
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.toolbar}>
                  <div className={styles.search} role="search">
                    <label htmlFor="student-search" className="sr-only">
                      Rechercher un élève par nom ou e-mail
                    </label>
                    <span className={styles.searchIcon} aria-hidden="true">🔍</span>
                    <input
                      id="student-search"
                      type="search"
                      className={`input ${styles.searchInput}`}
                      placeholder="Rechercher par nom ou e-mail…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    {query && (
                      <button
                        type="button"
                        className={styles.clear}
                        onClick={() => setQuery('')}
                        aria-label="Effacer la recherche"
                      >
                        ×
                      </button>
                    )}
                  </div>
                  <div className={styles.count} role="status" aria-live="polite">
                    {query
                      ? `${filtered.length} résultat${filtered.length > 1 ? 's' : ''}`
                      : `${students.length} élève${students.length > 1 ? 's' : ''}`}
                  </div>
                </div>

                {filtered.length === 0 ? (
                  <div className="dashboard-section">
                    <div className="empty-state">
                      <div className="empty-state-icon" aria-hidden="true">🔎</div>
                      <div className="empty-state-title">Aucun élève trouvé</div>
                      <div className="empty-state-text">
                        Aucun nom ni e-mail ne correspond à « {query.trim()} ».
                      </div>
                    </div>
                  </div>
                ) : (
                  <ul className={styles.grid}>
                    {filtered.map((student) => (
                      <li key={student.id}>
                        <StudentCard student={student} />
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </>
        )}
      </AppShell>
    </div>
  )
}
