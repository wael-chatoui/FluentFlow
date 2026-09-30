import { useCallback, useEffect, useRef } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import TeacherShell from '@/components/teacher/TeacherShell'
import LessonList, { LessonListSkeleton } from '@/components/teacher/LessonList'
import StudentProfileForm from '@/components/teacher/StudentProfileForm'
import PageState from '@/components/teacher/PageState'
import Skeleton from '@/components/teacher/Skeleton'
import BackLink from '@/components/teacher/lessons/BackLink'
import AccountPanel from '@/components/teacher/students/AccountPanel'
import PlanPanel from '@/components/teacher/students/PlanPanel'
import StudentHero, { StudentHeroSkeleton } from '@/components/teacher/students/StudentHero'
import { api } from '@/utils/apiClient'
import { accentStyle } from '@/components/ui/accents'
import { isStaleGeneration, isValidId, studentDisplayName } from '@/components/teacher/format'
import { useApiResource, usePolling } from '@/components/teacher/hooks'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/teacher/StudentPage.module.css'

// Anchors other pages link to (dashboard « Préparer », hero pills)
const ANCHORS = ['#plan', '#compte']

export default function TeacherStudentPage() {
  const router = useRouter()
  const id = router.isReady ? router.query.id : undefined
  const validId = isValidId(id)
  const path = validId ? `/api/teacher/students/${id}` : null
  const { data, error, notFound, loading: fetching, reload, setData } = useApiResource(path, {
    errorMessage: "Impossible de charger l'élève.",
  })
  const scrolled = useRef(false)

  const student = data?.student
  const lessons = data?.lessons || []
  const name = student ? studentDisplayName(student) : ''
  const newLessonHref = validId ? `/teacher/lessons/new?student=${id}` : '/teacher/lessons/new'

  // Lessons being generated refresh by themselves (stops once they are done or stuck)
  const generating = lessons.some((l) => l.status === 'generating' && !isStaleGeneration(l))
  const pollLessons = useCallback(
    async (signal) => {
      const next = await api(path, { signal })
      // Only the lessons: the profile form keeps what is being typed
      setData((prev) => (prev ? { ...prev, lessons: next.lessons || [] } : next))
    },
    [path, setData]
  )
  usePolling(generating, pollLessons, { interval: 6000, retryInterval: 12000 })

  // Links to #plan / #compte arrive before the content exists: scroll once it is there
  useEffect(() => {
    if (!student || scrolled.current) return
    scrolled.current = true
    if (ANCHORS.includes(window.location.hash)) {
      document.querySelector(window.location.hash)?.scrollIntoView({ block: 'start' })
    }
  }, [student])

  const handleSaved = useCallback(
    (res) => setData((prev) => ({ ...prev, ...res, lessons: res.lessons || prev?.lessons || [] })),
    [setData]
  )

  const invalid = router.isReady && !validId
  const loading = !router.isReady || fetching

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
        onRetry={reload}
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

        {!loading && <PlanPanel key={student.id} studentId={student.id} studentName={name} />}

        <section className={`${ui.card} ${styles.profileCard}`} aria-labelledby="profile-title">
          <div className={styles.sectionHead}>
            <h2 id="profile-title" className={`${ui.sectionTitle} ${styles.sectionTitle}`}>
              <span aria-hidden="true">🗂️</span> Fiche élève
            </h2>
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
              aiContext={data.ai_context}
              onSaved={handleSaved}
            />
          )}
        </section>

        {!loading && <AccountPanel key={student.id} student={student} />}
      </div>
    )
  }

  return (
    <TeacherShell>
      <Head>
        <title>{name ? `${name} — Preply Lessons` : 'Élève — Preply Lessons'}</title>
      </Head>

      <BackLink href="/teacher" label="Mes élèves" />

      {loading && !invalid && !error && !notFound && (
        <>
          <h1 className="sr-only">Élève</h1>
          <span className="sr-only" role="status">
            Chargement de l&apos;élève…
          </span>
        </>
      )}
      {content}
    </TeacherShell>
  )
}
