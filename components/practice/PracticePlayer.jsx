import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { gradeAnswer, scoreSession } from '@/utils/lesson/grading'
import McqExercise from '@/components/practice/McqExercise'
import FillBlankExercise from '@/components/practice/FillBlankExercise'
import MatchExercise from '@/components/practice/MatchExercise'
import FeedbackSheet, { describeFeedback } from '@/components/practice/FeedbackSheet'
import EndScreen from '@/components/practice/EndScreen'
import { playableExercises, cx } from '@/components/practice/utils'
import styles from '@/components/practice/PracticePlayer.module.css'
import { playSound } from '@/utils/sound'
import SoundToggle from '@/components/SoundToggle'

/*
 * Duolingo-style practice flow. Client-only: render it after mount (it shuffles
 * the match columns with Math.random in state initializers).
 *
 * Props:
 *   exercises   lessons.exercises (already normalized server-side; MCQ order is kept)
 *   onComplete  (answers: [{ exerciseId, value }]) => Promise<{ score?, total?, bestScore? } | void>
 *               Called once per run, when the last exercise is done. Only the FIRST
 *               attempt at each exercise is included. Throw/reject to show "Retry".
 *   onExit      () => void — close button / "Back to lesson".
 *   labels      optional { exit?: string, restart?: string | null, saved?: (result) => string }
 *               exit: end/empty-screen exit button text (default "Back to lesson");
 *               restart: "Practice again" text, null hides it;
 *               saved: text after "✓" once onComplete resolved (default "Score saved · Your best: …").
 *
 * An exercise may carry `lessonTitle` (review mode mixes several lessons): it is
 * shown as a small "From: <title>" tag above the prompt.
 */

const DEFAULT_LABELS = { exit: 'Back to lesson', restart: 'Practice again', saved: null }

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

function ConfirmExit({ onStay, onQuit }) {
  const titleId = useId()
  const stayRef = useRef(null)
  const quitRef = useRef(null)

  useEffect(() => {
    stayRef.current?.focus({ preventScroll: true })
  }, [])

  // Tiny focus trap between the two buttons
  const onKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      onStay()
    } else if (e.key === 'Tab') {
      e.preventDefault()
      const next = document.activeElement === stayRef.current ? quitRef.current : stayRef.current
      next?.focus()
    }
  }

  return (
    <div className={styles.dialogBackdrop} onClick={onStay}>
      <div
        className={styles.dialog}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
        onClick={(e) => e.stopPropagation()}
      >
        <span className={styles.dialogEmoji} aria-hidden="true">
          🥺
        </span>
        <h2 id={titleId} className={styles.dialogTitle}>
          Quit this practice? Your progress in this session will be lost.
        </h2>
        <div className={styles.dialogActions}>
          <button ref={stayRef} type="button" className={cx(styles.bigBtn, styles.primaryBtn)} onClick={onStay}>
            Keep practising
          </button>
          <button ref={quitRef} type="button" className={cx(styles.bigBtn, styles.quitBtn)} onClick={onQuit}>
            Quit
          </button>
        </div>
      </div>
    </div>
  )
}

function PracticeRun({ exercises, onComplete, onExit, onRestart, labels }) {
  // Snapshot for the whole run: a parent re-render must not reset anything
  const [items] = useState(() => exercises)
  const byId = useMemo(() => new Map(items.map((e) => [e.id, e])), [items])

  const [queue, setQueue] = useState(() => items.map((e) => e.id))
  const [pos, setPos] = useState(0)
  const [turn, setTurn] = useState(0) // bumps on every new screen → remounts the exercise
  const [answer, setAnswer] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [doneCount, setDoneCount] = useState(0)
  const [attempts, setAttempts] = useState([]) // first attempts: [{ exerciseId, value, correct }]
  const [phase, setPhase] = useState('play') // 'play' | 'done'
  const [confirming, setConfirming] = useState(false)
  const [save, setSave] = useState({ status: 'idle', result: null, error: '' })
  const [live, setLive] = useState('')

  const mountedRef = useRef(true)
  const lockRef = useRef(false) // blocks double Check / double Continue
  const attemptsRef = useRef([])
  const completeCalledRef = useRef(false)
  const answersRef = useRef([])
  const promptRef = useRef(null)
  const continueRef = useRef(null)
  const endHeadingRef = useRef(null)
  const closeRef = useRef(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const current = phase === 'play' ? byId.get(queue[pos]) : null
  const isRetry = pos >= items.length
  const progress = phase === 'done' ? 1 : items.length ? doneCount / items.length : 0

  // ---- saving ----
  const runSave = useCallback(
    (answers) => {
      setSave({ status: 'saving', result: null, error: '' })
      Promise.resolve()
        .then(() => (onComplete ? onComplete(answers) : null))
        .then((result) => {
          if (mountedRef.current) setSave({ status: 'saved', result: result || null, error: '' })
        })
        .catch((err) => {
          if (!mountedRef.current) return
          setSave({ status: 'error', result: null, error: err?.message || 'Please try again.' })
        })
    },
    [onComplete]
  )

  const finish = () => {
    setPhase('done')
    setFeedback(null)
    if (completeCalledRef.current) return
    completeCalledRef.current = true
    const perfect = attemptsRef.current.length === items.length && attemptsRef.current.every((a) => a.correct)
    playSound(perfect ? 'perfect' : 'complete')
    answersRef.current = attemptsRef.current.map(({ exerciseId, value }) => ({ exerciseId, value }))
    runSave(answersRef.current)
  }

  // ---- check / continue ----
  const check = (value) => {
    if (!current || lockRef.current || phase !== 'play') return
    lockRef.current = true
    const grade = gradeAnswer(current, value)
    const correct = grade.correct

    if (!attemptsRef.current.some((a) => a.exerciseId === current.id)) {
      attemptsRef.current = [...attemptsRef.current, { exerciseId: current.id, value, correct }]
      setAttempts(attemptsRef.current)
    }

    // A match always ends with every pair found, so it is never re-queued.
    const completed = correct || current.type === 'match'
    if (completed) setDoneCount((n) => n + 1)
    else setQueue((q) => [...q, current.id])

    const fb = { ...grade, value }
    setFeedback(fb)
    playSound(correct ? (grade.accentWarning ? 'almost' : 'correct') : current.type === 'match' ? 'almost' : 'wrong')
    const { title, answer: shown } = describeFeedback(current, fb)
    setLive(`${title}${shown ? ` ${shown}` : ''}`)
  }

  const next = () => {
    if (!feedback || !lockRef.current) return
    lockRef.current = false
    const nextPos = pos + 1
    // queue already contains any re-queued exercise (added at Check time)
    if (nextPos >= queue.length) {
      finish()
      return
    }
    setPos(nextPos)
    setTurn((t) => t + 1)
    setAnswer(null)
    setFeedback(null)
    setLive('')
  }

  const requestExit = () => {
    if (phase === 'done' || attemptsRef.current.length === 0) {
      onExit?.()
      return
    }
    setConfirming(true)
  }

  // ---- focus management ----
  useEffect(() => {
    if (feedback) continueRef.current?.focus({ preventScroll: true })
  }, [feedback])

  useEffect(() => {
    if (phase !== 'play') return
    // Fill-blank focuses its own input; otherwise focus the prompt for screen readers
    const ex = byId.get(queue[pos])
    if (ex && ex.type !== 'fill_blank') promptRef.current?.focus({ preventScroll: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, phase])

  useEffect(() => {
    if (phase === 'done') endHeadingRef.current?.focus({ preventScroll: true })
  }, [phase])

  // ---- keyboard: Enter = Check / Continue, 1/2/3 = MCQ choice, Esc = close ----
  const keyRef = useRef(null)
  keyRef.current = (e) => {
    if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return
    if (confirming || phase !== 'play' || !current) return
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
      if (canCheck(current, answer)) {
        e.preventDefault()
        check(answer)
      }
      return
    }

    if (!feedback && !typing && current.type === 'mcq' && /^[1-9]$/.test(e.key)) {
      const i = Number(e.key) - 1
      if (i < current.choices.length) {
        e.preventDefault()
        if (i !== answer) playSound('select')
        setAnswer(i)
      }
    }
  }

  useEffect(() => {
    const onKey = (e) => keyRef.current?.(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---- render ----
  const mistakes = attempts
    .filter((a) => !a.correct)
    .map((a) => ({ exercise: byId.get(a.exerciseId), value: a.value }))
    .filter((m) => m.exercise)

  const localScore = useMemo(() => scoreSession(items, attempts), [items, attempts])
  const serverScore = save.result && Number.isFinite(save.result.score) ? save.result : null
  const score = serverScore ? serverScore.score : localScore.score
  const total = serverScore && Number.isFinite(serverScore.total) ? serverScore.total : localScore.total

  return (
    <div className={styles.player}>
      <div className={styles.topBar}>
        <button
          ref={closeRef}
          type="button"
          className={styles.closeBtn}
          onClick={requestExit}
          aria-label={phase === 'done' ? 'Close' : 'Quit practice'}
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
          aria-valuenow={phase === 'done' ? items.length : doneCount}
          aria-valuetext={`${phase === 'done' ? items.length : doneCount} of ${items.length} exercises done`}
        >
          <div className={styles.progressFill} style={{ transform: `scaleX(${progress})` }} />
        </div>
        <SoundToggle className={styles.soundBtn} />
      </div>

      <div className={styles.body}>
        <div className={cx(styles.content, feedback && styles.contentWithSheet)}>
          {phase === 'play' && current && (
            <div key={turn} className={styles.screen}>
              {isRetry && (
                <p className={styles.retryBadge}>
                  <span aria-hidden="true">↻ </span>Previous mistake
                </p>
              )}
              {typeof current.lessonTitle === 'string' && current.lessonTitle && (
                <p className={styles.fromTag}>
                  <span aria-hidden="true">📘 </span>From: {current.lessonTitle}
                </p>
              )}
              <h1 ref={promptRef} tabIndex={-1} className={styles.prompt}>
                {current.prompt}
              </h1>
              {current.type === 'mcq' && (
                <McqExercise
                  exercise={current}
                  value={answer}
                  onChange={(i) => {
                    if (feedback) return
                    if (i !== answer) playSound('select')
                    setAnswer(i)
                  }}
                  feedback={feedback}
                />
              )}
              {current.type === 'fill_blank' && (
                <FillBlankExercise
                  exercise={current}
                  value={answer ?? ''}
                  onChange={(v) => !feedback && setAnswer(v)}
                  onSubmit={() => (feedback ? next() : canCheck(current, answer) && check(answer))}
                  feedback={feedback}
                />
              )}
              {current.type === 'match' && (
                <MatchExercise exercise={current} onDone={(value) => check(value)} disabled={Boolean(feedback)} />
              )}
            </div>
          )}

          {phase === 'done' && (
            <EndScreen
              ref={endHeadingRef}
              score={score}
              total={total}
              mistakes={mistakes}
              save={save}
              savedText={labels.saved}
              onRetrySave={() => runSave(answersRef.current)}
            />
          )}
        </div>
      </div>

      <div className={styles.bottomBar}>
        <div className={cx(styles.bottomInner, feedback && styles.hiddenKeepSpace)} aria-hidden={feedback ? true : undefined}>
          {phase === 'play' && current && current.type !== 'match' && (
            <button
              type="button"
              className={cx(styles.bigBtn, styles.primaryBtn)}
              disabled={!canCheck(current, answer) || Boolean(feedback)}
              tabIndex={feedback ? -1 : undefined}
              // Don't blur the input on press: closing the mobile keyboard mid-tap can move the button
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => check(answer)}
            >
              Check
            </button>
          )}
          {phase === 'play' && current && current.type === 'match' && (
            <p className={styles.barHint}>Tap a French word, then its English match</p>
          )}
          {phase === 'done' && (
            <div className={styles.endActions}>
              {labels.restart !== null && (
                <button
                  type="button"
                  className={cx(styles.bigBtn, styles.secondaryBtn)}
                  onClick={onRestart}
                  disabled={save.status === 'saving'}
                >
                  {labels.restart}
                </button>
              )}
              <button type="button" className={cx(styles.bigBtn, styles.primaryBtn)} onClick={() => onExit?.()}>
                {labels.exit}
              </button>
            </div>
          )}
        </div>
      </div>

      {feedback && current && (
        <FeedbackSheet ref={continueRef} exercise={current} feedback={feedback} onContinue={next} />
      )}

      <div className="sr-only" aria-live="polite">
        {live}
      </div>

      {confirming && (
        <ConfirmExit
          onStay={() => {
            setConfirming(false)
            requestAnimationFrame(() => closeRef.current?.focus({ preventScroll: true }))
          }}
          onQuit={() => {
            setConfirming(false)
            onExit?.()
          }}
        />
      )}
    </div>
  )
}

export default function PracticePlayer({ exercises, onComplete, onExit, labels: labelsProp }) {
  const items = useMemo(() => playableExercises(exercises), [exercises])
  const labels = {
    exit: labelsProp?.exit || DEFAULT_LABELS.exit,
    restart: labelsProp?.restart === null ? null : labelsProp?.restart || DEFAULT_LABELS.restart,
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

  if (items.length === 0) {
    return (
      <div className={styles.player}>
        <div className={styles.body}>
          <div className={cx(styles.content, styles.emptyContent)}>
            <div className={styles.empty}>
              <span className={styles.emptyEmoji} aria-hidden="true">🧩</span>
              <p className={styles.emptyTitle}>No exercises to practise</p>
              <p className={styles.emptyText}>This lesson doesn&apos;t have any exercises yet.</p>
            </div>
          </div>
        </div>
        <div className={styles.bottomBar}>
          <div className={styles.bottomInner}>
            <button type="button" className={cx(styles.bigBtn, styles.primaryBtn)} onClick={() => onExit?.()}>
              {labels.exit}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <PracticeRun
      key={run}
      exercises={items}
      onComplete={onComplete}
      onExit={onExit}
      onRestart={() => setRun((r) => r + 1)}
      labels={labels}
    />
  )
}
