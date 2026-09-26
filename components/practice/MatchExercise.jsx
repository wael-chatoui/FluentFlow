import { useEffect, useRef, useState } from 'react'
import { shuffle, cx } from '@/components/practice/utils'
import styles from '@/components/practice/Exercises.module.css'
import { playSound } from '@/utils/sound'

const WRONG_FLASH_MS = 450
const DONE_DELAY_MS = 350

function shuffledColumns(pairs) {
  const left = shuffle(pairs.map((p, i) => ({ i, text: p.fr })))
  let right = shuffle(pairs.map((p, i) => ({ i, text: p.en })))
  // Avoid the right column lining up exactly with the left one
  for (let tries = 0; tries < 5 && right.every((r, k) => r.i === left[k].i); tries++) {
    right = shuffle(right)
  }
  return { left, right }
}

/**
 * Match French ↔ English. Correct pairs lock; wrong pairs flash and count a mistake.
 * Calls onDone({ mistakes }) once, when every pair is matched.
 * The columns are shuffled once per mount, in a state initializer: this component
 * is only ever rendered on the client (inside the practice player).
 */
export default function MatchExercise({ exercise, onDone, disabled }) {
  const [columns] = useState(() => shuffledColumns(exercise.pairs))
  const [selLeft, setSelLeft] = useState(null)
  const [selRight, setSelRight] = useState(null)
  const [matched, setMatched] = useState(() => new Set())
  const [wrong, setWrong] = useState(null)
  const [announce, setAnnounce] = useState('')
  const mistakesRef = useRef(0)
  const doneRef = useRef(false)
  const timersRef = useRef([])
  const onDoneRef = useRef(onDone)
  onDoneRef.current = onDone

  useEffect(() => {
    const timers = timersRef.current
    return () => timers.forEach(clearTimeout)
  }, [])

  const later = (fn, ms) => {
    timersRef.current.push(setTimeout(fn, ms))
  }

  const total = exercise.pairs.length

  const evaluate = (l, r) => {
    setSelLeft(null)
    setSelRight(null)
    if (l === r) {
      const next = new Set(matched)
      next.add(l)
      setMatched(next)
      if (next.size < total) playSound('pair')
      setAnnounce(`Match: ${exercise.pairs[l].fr} — ${exercise.pairs[l].en}.`)
      if (next.size === total && !doneRef.current) {
        doneRef.current = true
        later(() => onDoneRef.current({ mistakes: mistakesRef.current }), DONE_DELAY_MS)
      }
    } else {
      mistakesRef.current += 1
      playSound('pairWrong')
      setWrong({ l, r })
      setAnnounce('Not a match, try again.')
      later(() => setWrong((w) => (w && w.l === l && w.r === r ? null : w)), WRONG_FLASH_MS)
    }
  }

  const tap = (side, i) => {
    if (disabled || doneRef.current || matched.has(i)) return
    setWrong(null)
    if (side === 'left') {
      const next = selLeft === i ? null : i
      setSelLeft(next)
      if (next !== null && selRight !== null) evaluate(next, selRight)
    } else {
      const next = selRight === i ? null : i
      setSelRight(next)
      if (next !== null && selLeft !== null) evaluate(selLeft, next)
    }
  }

  const renderTile = (side, item) => {
    const isMatched = matched.has(item.i)
    const isSelected = side === 'left' ? selLeft === item.i : selRight === item.i
    const isWrong = wrong && (side === 'left' ? wrong.l === item.i : wrong.r === item.i)
    return (
      <li key={`${side}-${item.i}`}>
        <button
          type="button"
          className={cx(
            styles.tile,
            isSelected && styles.tileSelected,
            isWrong && styles.tileWrong,
            isMatched && styles.tileMatched
          )}
          aria-pressed={isSelected}
          // aria-disabled (not disabled) so keyboard focus is not lost when a pair locks
          aria-disabled={isMatched || disabled || undefined}
          onClick={() => tap(side, item.i)}
          lang={side === 'left' ? 'fr' : 'en'}
        >
          {item.text}
          {isMatched && <span className="sr-only"> (matched)</span>}
        </button>
      </li>
    )
  }

  return (
    <div className={styles.exercise}>
      <div className={styles.matchGrid}>
        <div>
          <h2 className={styles.matchHead} id={`${exercise.id}-fr`}>French</h2>
          <ul className={styles.matchCol} aria-labelledby={`${exercise.id}-fr`}>
            {columns.left.map((item) => renderTile('left', item))}
          </ul>
        </div>
        <div>
          <h2 className={styles.matchHead} id={`${exercise.id}-en`}>English</h2>
          <ul className={styles.matchCol} aria-labelledby={`${exercise.id}-en`}>
            {columns.right.map((item) => renderTile('right', item))}
          </ul>
        </div>
      </div>
      <p className={styles.matchCount}>
        {matched.size} / {total} matched
      </p>
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
    </div>
  )
}
