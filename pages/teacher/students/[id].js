import { useCallback, useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import TeacherShell from '@/components/teacher/TeacherShell'
import LessonList, { LessonListSkeleton } from '@/components/teacher/LessonList'
import StudentProfileForm from '@/components/teacher/StudentProfileForm'
import PageState from '@/components/teacher/PageState'
import Skeleton from '@/components/teacher/Skeleton'
import StudentHero, { StudentHeroSkeleton } from '@/components/teacher/students/StudentHero'
import { api } from '@/utils/apiClient'
import { accentStyle } from '@/components/ui/accents'
import { isAbortError, isValidId, studentDisplayName } from '@/components/teacher/format'
import { useMountedRef } from '@/components/teacher/hooks'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/teacher/StudentPage.module.css'

function formatDate(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function TeacherStudentPage() {
  const router = useRouter()
  const mounted = useMountedRef()
  const controllerRef = useRef(null)
  const id = router.isReady ? router.query.id : undefined
  const validId = isValidId(id)

  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [notFound, setNotFound] = useState(false)

  const load = useCallback(async () => {
    if (!validId) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setError(null)
    setNotFound(false)
    setData(null)
    try {
      const res = await api(`/api/teacher/students/${id}`, { signal: controller.signal })
      if (!mounted.current || controller.signal.aborted) return
      setData(res)
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      if (err.status === 404) setNotFound(true)
      else setError(err.message || "Impossible de charger l'élève.")
    }
  }, [id, validId, mounted])

  useEffect(() => {
    load()
    return () => controllerRef.current?.abort()
  }, [load])

  const handleSaved = useCallback((res) => {
    setData((prev) => ({ ...prev, ...res, lessons: res.lessons || prev?.lessons || [] }))
  }, [])

  const student = data?.student
  const name = student ? studentDisplayName(student) : ''
  const lessons = data?.lessons || []
  const newLessonHref = validId ? `/teacher/lessons/new?student=${id}` : '/teacher/lessons/new'

  const invalid = router.isReady && !validId
  const loading = !invalid && !data && !error && !notFound

  let content
  if (invalid || notFound) {
    content = (
      <PageState
        icon="🔍"
        tone="purple"
        headingLevel={1}
        title="Élève introuvable"
        text="Ce lien ne correspond à aucun élève. Il a peut-être supprimé son compte."
        link={{ href: '/teacher', label: 'Retour à mes élèves' }}
      />
    )
  } else if (error) {
    content = (
      <PageState
        role="alert"
        icon="😕"
        headingLevel={1}
        title="Impossible de charger l'élève"
        text={error}
        onRetry={load}
      />
    )
  } else {
    content = (
      <div className={styles.stack}>
        {loading ? (
          <StudentHeroSkeleton style={validId ? accentStyle(id) : undefined} />
        ) : (
          <StudentHero student={student} newLessonHref={newLessonHref} />
        )}

        <section aria-labelledby="lessons-title" aria-busy={loading}>
          <div className={styles.sectionHead}>
            <h2 id="lessons-title" className={`${ui.sectionTitle} ${styles.sectionTitle}`}>
              <span aria-hidden="true">📚</span> Leçons
            </h2>
            {!loading && (
              <span className={styles.count}>
                {lessons.length}
                <span className="sr-only"> leçon{lessons.length > 1 ? 's' : ''}</span>
              </span>
            )}
          </div>
          {loading ? (
            <LessonListSkeleton />
          ) : lessons.length === 0 ? (
            <PageState
              icon="📝"
              tone="green"
              headingLevel={3}
              title="Aucune leçon pour l’instant"
              text="Après ton prochain cours, colle la transcription et les notes Canva pour générer le bilan."
              action={
                <Link href={newLessonHref} className={`${ui.btn} ${ui.green}`}>
                  <span aria-hidden="true">✨</span> Créer la première leçon
                </Link>
              }
            />
          ) : (
            <LessonList lessons={lessons} />
          )}
        </section>

        <section className={`${ui.card} ${styles.profileCard}`} aria-labelledby="profile-title">
          <div className={styles.sectionHead}>
            <h2 id="profile-title" className={`${ui.sectionTitle} ${styles.sectionTitle}`}>
              <span aria-hidden="true">🗂️</span> Fiche élève
            </h2>
            {!loading && student.created_at && (
              <span className={styles.since}>Compte créé le {formatDate(student.created_at)}</span>
            )}
          </div>
          {loading ? (
            <div className={styles.formSkeleton} aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div key={i}>
                  <Skeleton width={120} height={14} />
                  <Skeleton height={i > 1 ? 96 : 48} style={{ marginTop: 8 }} radius={14} />
                </div>
              ))}
            </div>
          ) : (
            <StudentProfileForm
              key={student.id}
              studentId={student.id}
              student={student}
              notes={data.notes}
              onSaved={handleSaved}
            />
          )}
        </section>
      </div>
    )
  }

  return (
    <TeacherShell>
      <Head>
        <title>{name ? `${name} — Preply Lessons` : 'Élève — Preply Lessons'}</title>
      </Head>

      <nav className={styles.crumbs} aria-label="Fil d’Ariane">
        <Link href="/teacher" className={styles.back}>
          <span aria-hidden="true">‹</span> Mes élèves
        </Link>
      </nav>

      {loading && (
        <>
          <h1 className="sr-only">Élève</h1>
          <span className="sr-only" role="status">Chargement de l&apos;élève…</span>
        </>
      )}
      {content}
    </TeacherShell>
  )
}
