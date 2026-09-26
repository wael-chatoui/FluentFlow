import { useCallback, useMemo, useState } from 'react'
import Head from 'next/head'
import LessonView from '@/components/lesson/LessonView'
import PracticePlayer from '@/components/practice/PracticePlayer'
import { SAMPLE_LESSON } from '@/utils/lesson/sample'
import { normalizeExercises, normalizeLessonContent } from '@/utils/lesson/schema'
import { scoreSession } from '@/utils/lesson/grading'

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
    <div className="dashboard">
      <Head>
        <title>Dev preview · Preply Lessons</title>
      </Head>
      <main className="dashboard-main" style={{ maxWidth: 960 }}>
        <div className="app-shell-titlebar">
          <h1 className="dashboard-title">
            {content.title} <span className="badge badge-gray">dev preview</span>
          </h1>
          <div className="app-shell-actions">
            <label className="btn btn-ghost no-print" style={{ minHeight: 44 }}>
              <input type="checkbox" checked={failSave} onChange={(e) => setFailSave(e.target.checked)} /> Simulate
              save error
            </label>
            <button type="button" className="btn btn-secondary no-print" style={{ minHeight: 44 }} onClick={() => window.print()}>
              Save as PDF
            </button>
            <button
              type="button"
              className="btn btn-primary no-print"
              style={{ minHeight: 44 }}
              onClick={() => setExercises(normalizeExercises(SAMPLE_LESSON.exercises))}
            >
              Start practice
            </button>
          </div>
        </div>

        {lastResult && (
          <div className="alert alert-success no-print" style={{ marginBottom: '1rem' }}>
            Last run: {lastResult.score}/{lastResult.total}
          </div>
        )}

        <LessonView content={content} />
      </main>

      {exercises && (
        <PracticePlayer exercises={exercises} onComplete={onComplete} onExit={() => setExercises(null)} />
      )}
    </div>
  )
}
