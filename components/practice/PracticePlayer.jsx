import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { scoreSession } from '@/utils/lesson/grading'
import { RichTextInline } from '@/components/lesson/RichText'
import McqExercise from '@/components/practice/McqExercise'
import FillBlankExercise from '@/components/practice/FillBlankExercise'
import MatchExercise from '@/components/practice/MatchExercise'
import FeedbackSheet, { describeFeedback } from '@/components/practice/FeedbackSheet'
import EndScreen from '@/components/practice/EndScreen'
import ConfirmExit from '@/components/practice/ConfirmExit'
import useLeaveGuard from '@/components/practice/useLeaveGuard'
import useFrenchSpeech from '@/components/student/vocabulary/useFrenchSpeech'
import { playableExercises, plainText, cx } from '@/components/practice/utils'
import {
  clearSnapshot,
  createRun,
  currentExercise,
  doneCount,
  firstAnswers,
  isEarlyContinue,
  isScoreFinal,
  keepSnapshot,
  loadSnapshot,
  newRunId,
  restoreRun,
  runReducer,
  storeSnapshot,
  toSnapshot,
} from '@/components/practice/runState'
import styles from '@/components/practice/PracticePlayer.module.css'
import { playSound } from '@/utils/sound'
import SoundToggle from '@/components/SoundToggle'

/*
 * Duolingo-style practice flow (student UI, English). Client-only: render it after
 * mount (it shuffles the match columns and reads sessionStorage in state initializers).
 *
 * Props:
 *   exercises   lessons.exercises as returned by the API (MCQ order is kept)
 *   title       lesson title (end screen subtitle, accessible name of the player)
 *   onComplete  (answers: [{ exerciseId, value }], { runId }) => Promise<{ score, total, bestScore, bestTotal } | void>
 *               Called ONCE per run, as soon as every exercise has a first attempt (the
 *               score is final even if mistakes are still being retried), with the FIRST
 *               attempt at each exercise. `runId` (uuid) is the same when the student
 *               retries a failed save, so the server can ignore duplicates. Reject to show
 *               "Retry"; an ApiError with code 'lesson_updated' shows "This lesson was
 *               updated" with a Restart button.
 *   onRestart   () => void — optional; "Restart" after 'lesson_updated' (reload the lesson
 *               and remount the player). Without it only the exit button is shown.
 *   onExit      () => void — close button / exit button of the end screen.
 *   resumeKey   optional, e.g. `lesson:<id>:<version>`: the run in progress is kept in
 *               sessionStorage and resumed after a reload (cleared on exit, and once saved
 *               as soon as the player goes away — a saved run's retry loop only survives a
 *               reload; leaving while the save is in flight keeps it until that save succeeds).
 *   preview     teacher preview: nothing is saved (onComplete is never called), no leave
 *               confirmation, French banner « Aperçu — rien n'est enregistré ».
 *   labels      optional { exit?: string, restart?: string | null, saved?: (result) => string }
 *               exit: exit button text (default "Back to lesson", « Fermer l'aperçu » in preview);
 *               restart: "Practice again" text, null hides it;
 *               saved: text after "✓" once onComplete resolved (default "Score saved · Your best: …").
 *
 * Leaving while the score isn't saved yet (unfinished run, failed save) asks for
 * confirmation: close button / Esc, in-app links, reload and the browser back button.
 *
 * An exercise may carry `lessonTitle` (review mode mixes several lessons): it is
 * shown as a small "From: <title>" tag above the prompt.
 */

const DEFAULT_LABELS = { exit: 'Back to lesson', restart: 'Practice again' }
const PREVIEW_LABELS = { exit: 'Fermer l’aperçu', restart: 'Recommencer' }
const LEAVE_MESSAGE = 'Leave this practice? Your score hasn’t been saved yet.'
const IDLE_SAVE = { status: 'idle', result: null, error: '' }

const CONFIRM_COPY = {
  progress: {
    title: 'Quit this practice? Your progress in this session will be lost.',
    stay: 'Keep practicing',
    quit: 'Quit',
  },
  unsaved: {
    title: 'Leave without saving? Your score couldn’t be saved yet.',
    stay: 'Stay',
    quit: 'Leave',
  },
  // "Practice again" while the save failed: the new run would drop this score
  restart: {
    title: 'Start again without saving? Your score couldn’t be saved yet.',
    stay: 'Stay',
    quit: 'Start again',
  },
}

function canCheck(exercise, value) {
  if (!exercise) return false
  if (exercise.type === 'mcq') return Number.isInteger(value)
  if (exercise.type === 'fill_blank') return typeof value === 'string' && value.trim().length > 0
  return false // match completes by itself
}

function isTyping(target) {
  if (!target) return false
  const tag = target.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable
}

/** Initial run: resumed from sessionStorage when possible, else a fresh one. */
function bootRun(items, resumeKey, preview) {
  if (resumeKey && !preview) {
    const restored = restoreRun(items, loadSnapshot(resumeKey))
    if (restored) return restored
    clearSnapshot(resumeKey) // other exercises (lesson edited) or unreadable
  }
  return { state: createRun(items, newRunId()), save: null }
}

function PreviewBanner() {
  return (
    <p className={styles.previewBanner} lang="fr">
      <span aria-hidden="true">👁️</span> Aperçu — rien n’est enregistré
    </p>
  )
}

function PracticeRun({ exercises, title, onComplete, onExit, onRestart, onPlayAgain, resumeKey, preview, labels }) {
  // Snapshot for the whole run: a parent re-render must not reset anything
  const [boot] = useState(() => bootRun(exercises, resumeKey, preview))
  const [state, dispatch] = useReducer(runReducer, boot.state)
  const [save, setSave] = useState(boot.save || IDLE_SAVE)
  const [outdated, setOutdated] = useState(false) // the save answered 'lesson_updated'
  const [confirming, setConfirming] = useState(null) // null | 'progress' | 'unsaved' | 'restart'
  const confirmedRef = useRef(null) // choice made in the dialog, applied once it has closed
  const [live, setLive] = useState('')
  const speech = useFrenchSpeech() // listen buttons; `supported` = a French voice is available

  const stateRef = useRef(state)
  stateRef.current = state
  const saveRef = useRef(save)
  saveRef.current = save
  const mountedRef = useRef(true)
  const saveStartedRef = useRef(Boolean(boot.save))
  const leftRef = useRef(false)
  const phaseRef = useRef(state.phase)
  const returnFocusRef = useRef(null)
  const promptRef = useRef(null)
  const continueRef = useRef(null)
  const endHeadingRef = useRef(null)
  const outdatedHeadingRef = useRef(null)
  const closeRef = useRef(null)
  const feedbackAtRef = useRef(-Infinity) // when the current feedback appeared (performance.now())

  useEffect(() => {
    mountedRef.current = true
    // Set after mount: live regions don't announce their initial content
    if (boot.state.resumed) setLive('Welcome back! Picking up where you left off.')
    return () => {
      mountedRef.current = false
    }
  }, [boot])

  const { items, feedback } = state
  const byId = useMemo(() => new Map(items.map((e) => [e.id, e])), [items])
  const current = currentExercise(state)
  const scoreFinal = isScoreFinal(state)
  const done = doneCount(state)
  const playing = state.phase === 'play' && !outdated

  // ---- saving (once per run, as soon as the score is final) ----
  const runSave = useCallback(() => {
    if (preview || !onComplete) return
    const run = stateRef.current
    const answers = firstAnswers(run)
    setSave({ status: 'saving', result: null, error: '' })
    Promise.resolve()
      .then(() => onComplete(answers, { runId: run.runId }))
      .then((result) => {
        // Left (close button, browser back, in-app link…) while this save was in flight:
        // the run was kept in case it failed, it has nothing left to resume now
        if ((leftRef.current || !mountedRef.current) && resumeKey) clearSnapshot(resumeKey)
        if (mountedRef.current) {
          setSave({ status: 'saved', result: result && typeof result === 'object' ? result : null, error: '' })
        }
      })
      .catch((err) => {
        const updated = err?.code === 'lesson_updated'
        if (updated && resumeKey) clearSnapshot(resumeKey) // this run can never be saved
        if (!mountedRef.current) return
        if (updated) {
          setOutdated(true)
          setSave(IDLE_SAVE)
          return
        }
        setSave({ status: 'error', result: null, error: err?.message || 'Please try again.' })
      })
  }, [onComplete, preview, resumeKey])

  useEffect(() => {
    if (!scoreFinal || saveStartedRef.current) return
    saveStartedRef.current = true
    runSave()
  }, [scoreFinal, runSave])

  // ---- keep the run in sessionStorage until its score is saved ----
  useEffect(() => {
    if (!resumeKey || preview || leftRef.current) return
    if (keepSnapshot(state, save, { outdated })) storeSnapshot(resumeKey, toSnapshot(state, save))
    else clearSnapshot(resumeKey)
    // `answer` (typing) is not part of the snapshot
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeKey, preview, outdated, save, state.queue, state.pos, state.feedback, state.first, state.phase])

  // Gone without the buttons below (browser back, in-app link…) once the score is saved,
  // e.g. during the retry loop: the next "Practice" must start a fresh run. A reload never
  // unmounts the player, so it still resumes the run. Only clears: a save still in flight
  // clears it itself when it succeeds (runSave).
  useEffect(() => {
    if (!resumeKey || preview) return undefined
    return () => {
      if (!keepSnapshot(stateRef.current, saveRef.current, { gone: true })) clearSnapshot(resumeKey)
    }
  }, [resumeKey, preview])

  // ---- leaving ----
  const risk =
    preview || outdated
      ? null
      : state.first.length > 0 && !scoreFinal
        ? 'progress'
        : save.status === 'error'
          ? 'unsaved'
          : null
  const bypassRef = useLeaveGuard(Boolean(risk), LEAVE_MESSAGE)

  // Stop keeping the run. A save still in flight keeps it until it succeeds (runSave):
  // if it fails after the student left, the next visit resumes the run and saves it
  // again with the same runId.
  const forget = () => {
    leftRef.current = true
    if (resumeKey && !preview && save.status !== 'saving') clearSnapshot(resumeKey)
    bypassRef.current = true
  }

  const leave = () => {
    forget()
    onExit?.()
  }

  const askConfirm = (kind) => {
    returnFocusRef.current = document.activeElement
    setConfirming(kind)
  }

  const requestExit = () => {
    if (!risk) leave()
    else askConfirm(risk)
  }

  const playAgain = () => {
    forget()
    onPlayAgain()
  }

  const requestPlayAgain = () => {
    if (save.status === 'error') askConfirm('restart')
    else playAgain()
  }

  // Quit / Start again from the dialog: act only after the dialog has unmounted. If the
  // parent removed the player in the same commit (review page), the dialog's cleanup
  // would run last and leave the page's scroll locked (overflow: hidden).
  useEffect(() => {
    const choice = confirmedRef.current
    if (confirming || !choice) return
    confirmedRef.current = null
    if (choice === 'restart') playAgain()
    else leave()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirming])

  // ---- check / continue ----
  const select = (i) => {
    if (feedback) return
    if (i !== state.answer) playSound('select')
    dispatch({ type: 'answer', value: i })
  }

  const check = (value) => {
    if (!current || feedback || !playing) return
    feedbackAtRef.current = performance.now()
    dispatch({ type: 'check', value })
  }

  // `event`: the click on Continue, if any. The second click of a double click / double tap
  // on Check lands on Continue (same place): ignored, or the feedback would flash by unread.
  const next = (event) => {
    if (isEarlyContinue(feedbackAtRef.current, performance.now(), event?.detail)) return
    dispatch({ type: 'continue' })
  }

  // Sound + announcement once per graded answer (not per click: double clicks are ignored by the reducer)
  useEffect(() => {
    if (!feedback || !current) return
    playSound(
      feedback.correct ? (feedback.accentWarning ? 'almost' : 'correct') : current.type === 'match' ? 'almost' : 'wrong'
    )
    const { title: fbTitle, answer } = describeFeedback(current, feedback)
    setLive(`${fbTitle}${answer ? ` ${plainText(answer)}` : ''}`)
    // A match can complete just after the quit dialog opened: keep the focus in the dialog
    if (!confirming) continueRef.current?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback])

  useEffect(() => {
    if (state.phase === 'done' && phaseRef.current !== 'done') {
      playSound(state.first.every((a) => a.correct) ? 'perfect' : 'complete')
    }
    phaseRef.current = state.phase
  }, [state.phase, state.first])

  // ---- focus management ----
  useEffect(() => {
    if (state.turn > 0) setLive('')
    if (!playing) return
    // Fill-blank focuses its own input; otherwise focus the prompt for screen readers
    const ex = currentExercise(stateRef.current)
    if (ex && ex.type !== 'fill_blank') promptRef.current?.focus({ preventScroll: true })
  }, [state.turn, playing])

  useEffect(() => {
    if (state.phase === 'done' && !outdated) endHeadingRef.current?.focus({ preventScroll: true })
  }, [state.phase, outdated])

  useEffect(() => {
    if (outdated) outdatedHeadingRef.current?.focus({ preventScroll: true })
  }, [outdated])

  // ---- keyboard: Enter = Check / Continue, 1/2/3 = MCQ choice, Esc = close ----
  const keyRef = useRef(null)
  keyRef.current = (e) => {
    if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return
    if (confirming || !playing || !current) return
    const target = e.target
    const typing = isTyping(target)

    if (e.key === 'Escape') {
      e.preventDefault()
      requestExit()
      return
    }

    if (e.key === 'Enter') {
      if (e.repeat) {
        e.preventDefault() // holding Enter must not skip through screens
        return
      }
      if (typing) return // the input handles its own Enter
      const button = target?.closest?.('button, a')
      if (feedback) {
        if (button) return // native activation (Continue is a button)
        e.preventDefault()
        next()
        return
      }
      if (current.type === 'match') return
      const isSelectedChoice = button?.dataset?.choice && button.getAttribute('aria-pressed') === 'true'
      if (button && !isSelectedChoice) return // e.g. Enter on a choice selects it
      if (canCheck(current, state.answer)) {
        e.preventDefault()
        check(state.answer)
      }
      return
    }

    if (!feedback && !typing && current.type === 'mcq' && /^[1-9]$/.test(e.key)) {
      const i = Number(e.key) - 1
      if (i < current.choices.length) {
        e.preventDefault()
        select(i)
      }
    }
  }

  useEffect(() => {
    const onKey = (e) => keyRef.current?.(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---- render ----
  const mistakes = state.first
    .filter((a) => !a.correct)
    .map((a) => ({ exercise: byId.get(a.exerciseId), value: a.value }))
    .filter((m) => m.exercise)

  const localScore = useMemo(() => scoreSession(items, state.first), [items, state.first])
  const serverScore = save.result && Number.isFinite(save.result.score) ? save.result : null
  const score = serverScore ? serverScore.score : localScore.score
  const total = serverScore && Number.isFinite(serverScore.total) ? serverScore.total : localScore.total
  const progressValue = state.phase === 'done' ? items.length : done
  const confirmCopy = confirming ? CONFIRM_COPY[confirming] : null

  const closeLabel = preview ? labels.exit : state.phase === 'done' || outdated ? 'Close' : 'Quit practice'

  return (
    <section className={styles.player} aria-label={title || 'Practice'} lang="en">
      {preview && <PreviewBanner />}
      <div className={styles.topBar}>
        <button
          ref={closeRef}
          type="button"
          className={styles.closeBtn}
          onClick={requestExit}
          aria-label={closeLabel}
          lang={preview ? 'fr' : undefined}
        >
          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </button>
        <div
          className={styles.progress}
          role="progressbar"
          aria-label="Progress"
          aria-valuemin={0}
          aria-valuemax={items.length}
          aria-valuenow={progressValue}
          aria-valuetext={`${progressValue} of ${items.length} exercises done`}
        >
          <div className={styles.progressFill} style={{ transform: `scaleX(${items.length ? progressValue / items.length : 0})` }} />
        </div>
        <SoundToggle className={styles.soundBtn} />
      </div>

      <div className={styles.body}>
        <div className={cx(styles.content, feedback && playing && styles.contentWithSheet)}>
          {outdated && (
            <div className={styles.notice}>
              <span className={styles.noticeEmoji} aria-hidden="true">
                🔄
              </span>
              <h1 ref={outdatedHeadingRef} tabIndex={-1} className={styles.endTitle}>
                This lesson was just updated
              </h1>
              <p className={styles.noticeText}>
                Your teacher changed this lesson while you were practicing, so this run can’t be saved.
                {onRestart ? ' Restart to practice the new version.' : ''}
              </p>
            </div>
          )}

          {/* The score is saved while mistakes are still being retried: a failed save shows here */}
          {playing && save.status === 'error' && (
            <div className={cx(styles.saveError, styles.playSaveError)} role="alert">
              <span>Couldn’t save your score. {save.error}</span>
              <button type="button" className={styles.smallBtn} onClick={runSave}>
                Retry
              </button>
            </div>
          )}

          {playing && current && (
            <div key={state.turn} className={styles.screen}>
              {(state.resumed || state.retry || current.lessonTitle) && (
                <div className={styles.tags}>
                  {state.resumed && (
                    <p className={styles.resumedTag}>
                      <span aria-hidden="true">↺ </span>Welcome back — picking up where you left off
                    </p>
                  )}
                  {state.retry && (
                    <p className={styles.retryBadge}>
                      <span aria-hidden="true">↻ </span>Previous mistake
                    </p>
                  )}
                  {state.retry && save.status === 'saved' && (
                    <p className={styles.savedTag}>
                      <span aria-hidden="true">✓ </span>Score saved
                    </p>
                  )}
                  {typeof current.lessonTitle === 'string' && current.lessonTitle && (
                    <p className={styles.fromTag}>
                      <span aria-hidden="true">📘 </span>From: {current.lessonTitle}
                    </p>
                  )}
                </div>
              )}
              <h1 ref={promptRef} tabIndex={-1} className={styles.prompt}>
                <RichTextInline text={current.prompt} />
              </h1>
              {current.type === 'mcq' && (
                <McqExercise exercise={current} value={state.answer} onChange={select} feedback={feedback} speech={speech} />
              )}
              {current.type === 'fill_blank' && (
                <FillBlankExercise
                  exercise={current}
                  value={state.answer ?? ''}
                  onChange={(v) => !feedback && dispatch({ type: 'answer', value: v })}
                  onSubmit={() => (feedback ? next() : canCheck(current, state.answer) && check(state.answer))}
                  feedback={feedback}
                />
              )}
              {current.type === 'match' && (
                <MatchExercise
                  exercise={current}
                  onDone={(value) => check(value)}
                  disabled={Boolean(feedback)}
                  speech={speech}
                />
              )}
            </div>
          )}

          {state.phase === 'done' && !outdated && (
            <EndScreen
              ref={endHeadingRef}
              score={score}
              total={total}
              title={title}
              mistakes={mistakes}
              save={save}
              preview={preview}
              savedText={labels.saved}
              onRetrySave={runSave}
            />
          )}
        </div>
      </div>

      <div className={styles.bottomBar}>
        <div
          className={cx(styles.bottomInner, feedback && playing && styles.hiddenKeepSpace)}
          aria-hidden={feedback && playing ? true : undefined}
        >
          {playing && current && current.type !== 'match' && (
            <button
              type="button"
              className={cx(styles.bigBtn, styles.primaryBtn)}
              disabled={!canCheck(current, state.answer) || Boolean(feedback)}
              tabIndex={feedback ? -1 : undefined}
              // Don't blur the input on press: closing the mobile keyboard mid-tap can move the button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => check(state.answer)}
            >
              Check
            </button>
          )}
          {playing && current && current.type === 'match' && (
            <p className={styles.barHint}>Tap a French word, then its English match</p>
          )}
          {state.phase === 'done' && !outdated && (
            <div className={styles.endActions}>
              {labels.restart !== null && (
                <button
                  type="button"
                  className={cx(styles.bigBtn, styles.secondaryBtn)}
                  onClick={requestPlayAgain}
                  disabled={save.status === 'saving'}
                  lang={preview ? 'fr' : undefined}
                >
                  {labels.restart}
                </button>
              )}
              <button
                type="button"
                className={cx(styles.bigBtn, styles.primaryBtn)}
                onClick={requestExit}
                lang={preview ? 'fr' : undefined}
              >
                {labels.exit}
              </button>
            </div>
          )}
          {outdated && (
            <div className={styles.endActions}>
              <button type="button" className={cx(styles.bigBtn, onRestart ? styles.secondaryBtn : styles.primaryBtn)} onClick={leave}>
                {labels.exit}
              </button>
              {onRestart && (
                <button
                  type="button"
                  className={cx(styles.bigBtn, styles.primaryBtn)}
                  onClick={() => {
                    forget()
                    onRestart()
                  }}
                >
                  Restart
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {feedback && current && playing && (
        <FeedbackSheet ref={continueRef} exercise={current} feedback={feedback} onContinue={next} speech={speech} />
      )}

      <div className="sr-only" aria-live="polite">
        {live}
      </div>

      {confirmCopy && (
        <ConfirmExit
          title={confirmCopy.title}
          stayLabel={confirmCopy.stay}
          quitLabel={confirmCopy.quit}
          onStay={() => {
            setConfirming(null)
            // Back to the button that opened the dialog (Safari doesn't focus buttons on click)
            const back = returnFocusRef.current
            const target = back && back !== document.body && back.isConnected ? back : closeRef.current
            requestAnimationFrame(() => target?.focus({ preventScroll: true }))
          }}
          onQuit={() => {
            confirmedRef.current = confirming === 'restart' ? 'restart' : 'leave'
            setConfirming(null)
          }}
        />
      )}
    </section>
  )
}

function EmptyPlayer({ preview, exitLabel, onExit }) {
  return (
    <section className={styles.player} lang="en">
      {preview && <PreviewBanner />}
      <div className={styles.body}>
        <div className={cx(styles.content, styles.emptyContent)}>
          <div className={styles.empty} lang={preview ? 'fr' : undefined}>
            <span className={styles.emptyEmoji} aria-hidden="true">
              🧩
            </span>
            <h1 className={styles.emptyTitle}>{preview ? 'Aucun exercice à tester' : 'No exercises to practice'}</h1>
            <p className={styles.emptyText}>
              {preview ? 'Cette leçon n’a pas encore d’exercices.' : 'This lesson doesn’t have any exercises yet.'}
            </p>
          </div>
        </div>
      </div>
      <div className={styles.bottomBar}>
        <div className={styles.bottomInner}>
          <button
            type="button"
            className={cx(styles.bigBtn, styles.primaryBtn)}
            onClick={() => onExit?.()}
            lang={preview ? 'fr' : undefined}
          >
            {exitLabel}
          </button>
        </div>
      </div>
    </section>
  )
}

export default function PracticePlayer({
  exercises,
  title,
  onComplete,
  onExit,
  onRestart,
  resumeKey,
  preview = false,
  labels: labelsProp,
}) {
  const items = useMemo(() => playableExercises(exercises), [exercises])
  const defaults = preview ? PREVIEW_LABELS : DEFAULT_LABELS
  const labels = {
    exit: labelsProp?.exit || defaults.exit,
    restart: labelsProp?.restart === null ? null : labelsProp?.restart || defaults.restart,
    saved: typeof labelsProp?.saved === 'function' ? labelsProp.saved : null,
  }
  const [run, setRun] = useState(0)

  // Full-screen: stop the page behind from scrolling
  useEffect(() => {
    const { body } = document
    const previous = body.style.overflow
    body.style.overflow = 'hidden'
    return () => {
      body.style.overflow = previous
    }
  }, [])

  if (items.length === 0) return <EmptyPlayer preview={preview} exitLabel={labels.exit} onExit={onExit} />

  return (
    <PracticeRun
      key={`${run}:${resumeKey || ''}`}
      exercises={items}
      title={typeof title === 'string' ? title.trim() : ''}
      onComplete={onComplete}
      onExit={onExit}
      onRestart={onRestart}
      onPlayAgain={() => setRun((r) => r + 1)}
      resumeKey={resumeKey}
      preview={preview}
      labels={labels}
    />
  )
}
