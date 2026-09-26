import { useCallback, useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import AppShell from '@/components/AppShell'
import { api } from '@/utils/apiClient'
import { safeDriveUrl } from '@/utils/lesson/schema'
import LessonList, { LessonListSkeleton } from '@/components/teacher/LessonList'
import StudentProfileForm from '@/components/teacher/StudentProfileForm'
import PageState from '@/components/teacher/PageState'
import Skeleton from '@/components/teacher/Skeleton'
import {
  LEVEL_LABELS,
  initialsOf,
  isAbortError,
  isValidId,
  levelBadgeText,
  studentDisplayName,
} from '@/components/teacher/format'
import { useMountedRef } from '@/components/teacher/hooks'
import shared from '@/components/teacher/Teacher.module.css'
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
  const level = levelBadgeText(student?.level)
  const lessons = data?.lessons || []
  const newLessonHref = validId ? `/teacher/lessons/new?student=${id}` : '/teacher/lessons/new'

  const invalid = router.isReady && !validId
  const loading = !invalid && !data && !error && !notFound

  let content
  if (invalid || notFound) {
    content = (
      <PageState
        icon="🔍"
        title="Élève introuvable"
        text="Ce lien ne correspond à aucun élève. Il a peut-être supprimé son compte."
        link={{ href: '/teacher', label: 'Retour à mes élèves' }}
      />
    )
  } else if (error) {
    content = <PageState role="alert" title="Impossible de charger l'élève" text={error} onRetry={load} />
  } else {
    content = (
      <div className={shared.stack}>
        <section className={styles.hero} aria-busy={loading}>
          {loading ? (
            <>
              <Skeleton width={56} height={56} radius="50%" />
              <div className={styles.heroText}>
                <Skeleton width="55%" height={14} />
                <Skeleton width="40%" height={22} style={{ marginTop: 10 }} radius={999} />
              </div>
            </>
          ) : (
            <>
              <div className={styles.avatar} aria-hidden="true">{initialsOf(name)}</div>
              <div className={styles.heroText}>
                <div className={styles.heroEmail}>
                  {student.full_name?.trim() ? student.email : 'Nom non renseigné'}
                </div>
                <div className={styles.heroBadges}>
                  <span className={level ? 'badge badge-pink' : 'badge badge-gray'}>
                    {LEVEL_LABELS[student.level] || LEVEL_LABELS.unknown}
                  </span>
                  {student.onboarded_at ? (
                    <span className="badge badge-green">Inscrit</span>
                  ) : (
                    <span className="badge badge-gray">Pas encore inscrit</span>
                  )}
                  {safeDriveUrl(student.drive_folder_url) && (
                    <a
                      href={safeDriveUrl(student.drive_folder_url)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={styles.driveLink}
                    >
                      📁 Dossier Drive<span className="sr-only"> (nouvel onglet)</span>
                    </a>
                  )}
                </div>
              </div>
            </>
          )}
        </section>

        <section className="dashboard-section" aria-labelledby="lessons-title">
          <div className={`dashboard-section-header ${shared.sectionHeader}`}>
            <h2 id="lessons-title" className="dashboard-section-title">
              📚 Leçons
              {!loading && <span className="badge badge-gray">{lessons.length}</span>}
            </h2>
          </div>
          {loading ? (
            <LessonListSkeleton />
          ) : lessons.length === 0 ? (
            <div className="empty-state">
              <div className="empty-state-icon" aria-hidden="true">📝</div>
              <div className="empty-state-title">Aucune leçon pour l&apos;instant</div>
              <div className="empty-state-text">
                Après ton prochain cours, colle la transcription et les notes Canva pour générer le bilan.
              </div>
              <Link href={newLessonHref} className={`btn btn-primary ${styles.emptyCta}`}>
                ✨ Créer la première leçon
              </Link>
            </div>
          ) : (
            <LessonList lessons={lessons} />
          )}
        </section>

        <section className="dashboard-section" aria-labelledby="profile-title">
          <div className={`dashboard-section-header ${shared.sectionHeader}`}>
            <h2 id="profile-title" className="dashboard-section-title">🗂️ Fiche élève</h2>
            {!loading && student.created_at && (
              <span className={styles.since}>Compte créé le {formatDate(student.created_at)}</span>
            )}
          </div>
          <div className="dashboard-section-body">
            {loading ? (
              <div className={styles.formSkeleton} aria-hidden="true">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i}>
                    <Skeleton width={120} height={12} />
                    <Skeleton height={i > 1 ? 80 : 44} style={{ marginTop: 8 }} radius={10} />
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
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className={shared.page}>
      <Head>
        <title>{name ? `${name} — Preply Lessons` : 'Élève — Preply Lessons'}</title>
      </Head>
      <AppShell
        title={name || 'Élève'}
        back={{ href: '/teacher', label: 'Mes élèves' }}
        actions={
          !invalid && !notFound ? (
            <Link href={newLessonHref} className="btn btn-primary">
              ✨ Nouvelle leçon
            </Link>
          ) : undefined
        }
      >
        {loading && <span className="sr-only" role="status">Chargement de l&apos;élève…</span>}
        {content}
      </AppShell>
    </div>
  )
}
