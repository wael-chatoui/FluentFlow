import { useCallback, useMemo, useRef, useState } from 'react'
import Head from 'next/head'
import LessonView from '@/components/lesson/LessonView'
import PracticePlayer from '@/components/practice/PracticePlayer'
import { devExercises, devSaveResult } from '@/components/dev/devLesson'
import { SAMPLE_LESSON } from '@/utils/lesson/sample'
import { normalizeLessonContent } from '@/utils/lesson/schema'
import { scoreSession } from '@/utils/lesson/grading'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/dev/DevPreview.module.css'

// Dev-only preview of LessonView + PracticePlayer with SAMPLE_LESSON: every player
// state can be triggered from here (save error, "lesson updated", teacher preview,
// review mode, resume after a reload). No auth, no API calls. 404 in production.
export async function getServerSideProps() {
  if (process.env.NODE_ENV === 'production') return { notFound: true }
  return { props: {} }
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const REVIEW_LABELS = {
  exit: 'Done',
  restart: null,
  saved: (result) => `Saved · ${result?.score ?? '?'}/${result?.total ?? '?'} fixed`,
}

const TOGGLES = [
  ['failSave', 'Simulate a save error'],
  ['lessonUpdated', 'Simulate « lesson updated » on save'],
  ['reviewMode', 'Review mode (lesson tags, no restart)'],
  ['edgeCases', 'Add edge-case exercises'],
]

export default function DevPreviewPage() {
  const content = useMemo(() => normalizeLessonContent(SAMPLE_LESSON), [])
  const [options, setOptions] = useState({ failSave: false, lessonUpdated: false, reviewMode: false, edgeCases: false })
  const [version, setVersion] = useState(1)
  const [session, setSession] = useState(null) // null | { preview: boolean }
  const [lastResult, setLastResult] = useState(null)
  const resultsRef = useRef(new Map()) // runId → result, like practice_sessions

  const exercises = useMemo(
    () => devExercises({ version, edgeCases: options.edgeCases, reviewMode: options.reviewMode }),
    [version, options.edgeCases, options.reviewMode]
  )
  const resumeKey = `dev:${version}:${options.edgeCases ? 'edge' : 'base'}:${options.reviewMode ? 'review' : 'lesson'}`

  const onComplete = useCallback(
    async (answers, { runId }) => {
      console.info('[dev/preview] save', { runId, answers })
      await wait(600)
      if (options.lessonUpdated) {
        throw Object.assign(new Error('This lesson was just updated by your teacher.'), {
          status: 409,
          code: 'lesson_updated',
        })
      }
      if (options.failSave) throw new Error('Simulated save error.')
      const result = devSaveResult(resultsRef.current, runId, scoreSession(exercises, answers))
      setLastResult(result)
      return result
    },
    [exercises, options.failSave, options.lessonUpdated]
  )

  // "Lesson updated" → Restart: the parent reloads the new version of the lesson
  const onRestart = useCallback(() => {
    setOptions((o) => ({ ...o, lessonUpdated: false }))
    setVersion((v) => v + 1)
  }, [])

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
            <button type="button" className={`${ui.btn} ${ui.ghost}`} onClick={() => window.print()}>
              Save as PDF
            </button>
            <button type="button" className={`${ui.btn} ${ui.ghost}`} onClick={() => setSession({ preview: true })}>
              Teacher preview
            </button>
            <button type="button" className={`${ui.btn} ${ui.green}`} onClick={() => setSession({ preview: false })}>
              Start practice
            </button>
          </div>
        </header>

        <fieldset className={`${styles.options} no-print`}>
          <legend className={styles.legend}>Player simulation · lesson version {version}</legend>
          {TOGGLES.map(([key, label]) => (
            <label key={key} className={styles.toggle}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={options[key]}
                onChange={(e) => setOptions((o) => ({ ...o, [key]: e.target.checked }))}
              />
              {label}
            </label>
          ))}
          <p className={styles.help}>
            An unfinished run is kept for this tab: reload the page, then Start practice again to resume it.
          </p>
        </fieldset>

        {lastResult && (
          <p className={`${styles.result} no-print`} role="status">
            <span aria-hidden="true">✅</span> Last run: {lastResult.score}/{lastResult.total}
            {lastResult.duplicate ? ' (duplicate save ignored)' : ''} · best {lastResult.bestScore}/{lastResult.bestTotal}
          </p>
        )}

        <LessonView content={content} lessonDate="2026-09-26" studentName="Alex Martin (sample)" />
      </main>

      {session && (
        <PracticePlayer
          key={`${session.preview ? 'preview' : 'run'}:${resumeKey}`}
          exercises={exercises}
          title={content.title}
          preview={session.preview}
          resumeKey={resumeKey}
          onComplete={onComplete}
          onRestart={onRestart}
          onExit={() => setSession(null)}
          labels={options.reviewMode ? REVIEW_LABELS : undefined}
        />
      )}
    </div>
  )
}
