import { useCallback, useMemo, useState } from 'react'
import Head from 'next/head'
import LessonView from '@/components/lesson/LessonView'
import PracticePlayer from '@/components/practice/PracticePlayer'
import { SAMPLE_LESSON } from '@/utils/lesson/sample'
import { normalizeExercises, normalizeLessonContent } from '@/utils/lesson/schema'
import { scoreSession } from '@/utils/lesson/grading'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/dev/DevPreview.module.css'

// Dev-only preview of LessonView + PracticePlayer with SAMPLE_LESSON.
// No auth, no API calls. 404 in production.
export async function getServerSideProps() {
  if (process.env.NODE_ENV === 'production') return { notFound: true }
  return { props: {} }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

export default function DevPreviewPage() {
  const content = useMemo(() => normalizeLessonContent(SAMPLE_LESSON), [])
  // normalizeExercises shuffles MCQ choices → only on the client, when practice starts
  const [exercises, setExercises] = useState(null)
  const [failSave, setFailSave] = useState(false)
  const [lastResult, setLastResult] = useState(null)

  const onComplete = useCallback(
    async (answers) => {
      console.log('[dev/preview] first attempts', answers)
      await wait(600)
      if (failSave) throw new Error('Simulated save error.')
      const { score, total } = scoreSession(exercises || [], answers)
      const result = { score, total, bestScore: Math.max(score, lastResult?.bestScore ?? 0) }
      setLastResult(result)
      return result
    },
    [exercises, failSave, lastResult]
  )

  return (
    <div className={ui.theme}>
      <Head>
        <title>Dev preview · Preply Lessons</title>
      </Head>
      <main className={styles.main}>
        <header className={styles.header}>
          <div className={styles.titleRow}>
            <span className={`${ui.pill} ${styles.devPill} no-print`}>
              <span aria-hidden="true">🛠️</span> Dev preview
            </span>
            <h1 className={styles.title}>{content.title}</h1>
          </div>
          <div className={`${styles.actions} no-print`}>
            <label className={styles.toggle}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={failSave}
                onChange={(e) => setFailSave(e.target.checked)}
              />
              Simulate save error
            </label>
            <button type="button" className={`${ui.btn} ${ui.ghost}`} onClick={() => window.print()}>
              Save as PDF
            </button>
            <button
              type="button"
              className={`${ui.btn} ${ui.green}`}
              onClick={() => setExercises((prev) => prev || normalizeExercises(SAMPLE_LESSON.exercises))}
            >
              Start practice
            </button>
          </div>
        </header>

        {lastResult && (
          <p className={`${styles.result} no-print`} role="status">
            <span aria-hidden="true">✅</span> Last run: {lastResult.score}/{lastResult.total}
          </p>
        )}

        <LessonView content={content} />
      </main>

      {exercises && (
        <PracticePlayer exercises={exercises} onComplete={onComplete} onExit={() => setExercises(null)} />
      )}
    </div>
  )
}
