import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { splitBlank, cx } from '@/components/practice/utils'
import styles from '@/components/practice/Exercises.module.css'

const ACCENTS = ['é', 'è', 'ê', 'à', 'ç', 'ù', 'â', 'î', 'ô', 'ë', 'ï', 'œ']

// useLayoutEffect warns during SSR; the player is client-only but stay safe.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * Fill in the blank: an inline input replaces ___ in the sentence.
 * @param {{ exercise: object, value: string, onChange: (v: string) => void, onSubmit: () => void, feedback: object|null }} props
 */
export default function FillBlankExercise({ exercise, value, onChange, onSubmit, feedback }) {
  const hintId = useId()
  const inputRef = useRef(null)
  const caretRef = useRef(null)
  const pendingCaretRef = useRef(null)
  const [showHint, setShowHint] = useState(false)
  const graded = Boolean(feedback)
  const text = typeof value === 'string' ? value : ''
  const parts = splitBlank(exercise.sentence) || [exercise.sentence ? `${exercise.sentence} ` : '', '']

  const longest = Math.max(...exercise.answers.map((a) => a.length), 4)
  const width = `${Math.min(Math.max(longest + 3, 7), 24)}ch`

  // Focus the input when the exercise appears, without scrolling the page
  useEffect(() => {
    inputRef.current?.focus({ preventScroll: true })
  }, [])

  // Restore the caret after an accent was inserted
  useIsoLayoutEffect(() => {
    const pos = pendingCaretRef.current
    const input = inputRef.current
    if (pos === null || !input) return
    pendingCaretRef.current = null
    input.focus({ preventScroll: true })
    try {
      input.setSelectionRange(pos, pos)
    } catch {
      // some input types don't support selection; ignore
    }
  }, [text])

  const rememberCaret = (e) => {
    caretRef.current = { start: e.target.selectionStart, end: e.target.selectionEnd }
  }

  const insertAccent = (ch) => {
    if (graded) return
    const caret = caretRef.current
    const start = Number.isInteger(caret?.start) ? Math.min(caret.start, text.length) : text.length
    const end = Number.isInteger(caret?.end) ? Math.min(Math.max(caret.end, start), text.length) : start
    const next = text.slice(0, start) + ch + text.slice(end)
    const pos = start + ch.length
    caretRef.current = { start: pos, end: pos }
    pendingCaretRef.current = pos
    onChange(next)
  }

  return (
    <div className={styles.exercise}>
      <p className={cx(styles.sentence, styles.sentenceFill)}>
        {parts[0]}
        <input
          ref={inputRef}
          type="text"
          className={cx(
            styles.blankInput,
            graded && (feedback.correct ? styles.blankInputGood : styles.blankInputBad)
          )}
          style={{ width }}
          value={text}
          onChange={(e) => {
            rememberCaret(e)
            onChange(e.target.value)
          }}
          onSelect={rememberCaret}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault()
              if (!e.repeat) onSubmit()
            }
          }}
          disabled={graded}
          aria-label={`Missing word in: ${exercise.sentence.replace('___', '…')}`}
          aria-describedby={showHint && exercise.hint ? hintId : undefined}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          enterKeyHint="done"
          maxLength={120}
          lang="fr"
        />
        {parts[1]}
      </p>

      {exercise.hint && (
        <div className={styles.hintRow}>
          <button
            type="button"
            className={styles.hintToggle}
            aria-expanded={showHint}
            aria-controls={hintId}
            onClick={() => setShowHint((s) => !s)}
          >
            <span aria-hidden="true">💡 </span>
            {showHint ? 'Hide hint' : 'Show hint'}
          </button>
          <p id={hintId} className={styles.hint} hidden={!showHint}>
            {exercise.hint}
          </p>
        </div>
      )}

      <div className={styles.accents} role="group" aria-label="Insert a French character">
        {ACCENTS.map((ch) => (
          <button
            key={ch}
            type="button"
            className={styles.accentKey}
            disabled={graded}
            // Keep the focus (and the mobile keyboard) in the input
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => insertAccent(ch)}
            aria-label={`Insert ${ch}`}
          >
            {ch}
          </button>
        ))}
      </div>
    </div>
  )
}
