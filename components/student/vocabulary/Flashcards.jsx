import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { shuffle, cx, plainText } from '@/components/practice/utils'
import { RichTextInline } from '@/components/lesson/RichText'
import SpeakButton from '@/components/student/vocabulary/SpeakButton'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/student/vocabulary/Flashcards.module.css'
import { playSound } from '@/utils/sound'

const SWIPE_THRESHOLD = 80 // px
const DRAG_START = 10 // px before a touch counts as a horizontal drag
const AGAIN_GAP = 3 // an "Again" card comes back after this many other cards
const NO_DRAG = { dx: 0, active: false, returning: false }

function sizeClass(text) {
  const n = plainText(text).length
  if (n > 70) return styles.textXs
  if (n > 34) return styles.textSm
  return ''
}

function isTyping(target) {
  const tag = target?.tagName
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || Boolean(target?.isContentEditable)
}

// `text` may highlight a word with **…** (rendered with RichTextInline); `plain` is for
// screen readers and speech
function sides(item, direction) {
  const face = (label, flag, text, lang) => ({ label, flag, text, plain: plainText(text), lang })
  const fr = face('French', '🇫🇷', item.fr, 'fr')
  const en = face('English', '🇬🇧', item.en || '(no translation)', 'en')
  return direction === 'en-fr' ? { front: en, back: fr } : { front: fr, back: en }
}

/**
 * Flashcards session over `items` (local state only, no API).
 * The deck is shuffled once on mount — remount (key) to rebuild it from a new filter.
 * @param {{ items: Array<{ key, fr, en, example }>, speech: object,
 *   direction: 'fr-en'|'en-fr', onDirectionChange: (d: 'fr-en'|'en-fr') => void }} props
 */
export default function Flashcards({ items, speech, direction, onDirectionChange }) {
  const byKey = useMemo(() => new Map(items.map((i) => [i.key, i])), [items])
  const [queue, setQueue] = useState(null) // card keys; null until shuffled on the client
  const [total, setTotal] = useState(0)
  const [done, setDone] = useState(0)
  const [missed, setMissed] = useState(() => new Set())
  const [firstTry, setFirstTry] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [turn, setTurn] = useState(0)
  const [drag, setDrag] = useState(NO_DRAG)
  const [live, setLive] = useState('')

  const cardRef = useRef(null)
  const endHeadingRef = useRef(null)
  const pointerRef = useRef(null)
  const suppressClickUntilRef = useRef(0)
  const ratedTurnRef = useRef(-1)

  const start = useCallback((keys) => {
    setQueue(shuffle(keys))
    setTotal(keys.length)
    setDone(0)
    setMissed(new Set())
    setFirstTry(0)
    setFlipped(false)
    setTurn((t) => t + 1)
    setDrag(NO_DRAG)
    setLive(`New deck: ${keys.length} ${keys.length === 1 ? 'card' : 'cards'}.`)
  }, [])

  // Shuffle once when the deck mounts (effect → Math.random never runs during SSR)
  useEffect(() => {
    start(items.map((i) => i.key))
    // Keyboard users can flip with Space right away (unless they are using a field,
    // e.g. the deck picker, which rebuilds the deck on every change)
    requestAnimationFrame(() => {
      if (!isTyping(document.activeElement)) cardRef.current?.focus({ preventScroll: true })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const current = queue && queue.length ? byKey.get(queue[0]) : null
  const finished = queue !== null && queue.length === 0
  const { front, back } = current ? sides(current, direction) : { front: null, back: null }

  useEffect(() => {
    if (finished) endHeadingRef.current?.focus({ preventScroll: true })
  }, [finished])

  // ---- actions ----
  const flip = () => {
    if (!current) return
    const next = !flipped
    setFlipped(next)
    playSound('flip')
    setLive(next ? `${back.label}: ${back.plain}` : `${front.label}: ${front.plain}`)
  }

  const rate = (gotIt) => {
    if (!queue || !queue.length || ratedTurnRef.current === turn) return
    ratedTurnRef.current = turn
    const [key, ...rest] = queue
    let nextDone = done
    // Last card of the deck gets the end-of-deck fanfare instead
    playSound(gotIt ? (rest.length === 0 ? 'complete' : 'pair') : 'pairWrong')
    if (gotIt) {
      nextDone = done + 1
      if (!missed.has(key)) setFirstTry((n) => n + 1)
      setDone(nextDone)
      setQueue(rest)
    } else {
      const nextMissed = new Set(missed)
      nextMissed.add(key)
      setMissed(nextMissed)
      const at = Math.min(rest.length, AGAIN_GAP)
      setQueue([...rest.slice(0, at), key, ...rest.slice(at)])
    }
    setFlipped(false)
    setTurn((t) => t + 1)
    setDrag(NO_DRAG)
    setLive(`${gotIt ? 'Got it' : 'Again — this card will come back'}. ${nextDone} of ${total} done.`)
  }

  const rateFromButton = (gotIt) => {
    rate(gotIt)
    // Keep Space = flip: move focus back to the card
    cardRef.current?.focus({ preventScroll: true })
  }

  const changeDirection = (d) => {
    if (d === direction) return
    onDirectionChange(d)
    setFlipped(false)
  }

  // ---- keyboard: Space = flip, 1 = Again, 2 = Got it ----
  const keyRef = useRef(null)
  keyRef.current = (e) => {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.isComposing) return
    if (isTyping(e.target) || finished || !current) return
    if (e.key === ' ' || e.key === 'Spacebar') {
      if (e.target?.closest?.('button, a, [role="button"]')) return // native activation (incl. the card)
      e.preventDefault()
      if (!e.repeat) flip()
      return
    }
    if (e.key === '1' || e.key === '2') {
      e.preventDefault()
      if (!e.repeat) rate(e.key === '2')
    }
  }

  useEffect(() => {
    const onKey = (e) => keyRef.current?.(e)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ---- swipe (touch/pen only; the mouse just clicks to flip) ----
  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' || !current) return
    pointerRef.current = { id: e.pointerId, x: e.clientX, y: e.clientY, active: false }
  }

  const onPointerMove = (e) => {
    const p = pointerRef.current
    if (!p || p.id !== e.pointerId) return
    const dx = e.clientX - p.x
    const dy = e.clientY - p.y
    if (!p.active) {
      if (Math.abs(dx) < DRAG_START && Math.abs(dy) < DRAG_START) return
      if (Math.abs(dy) > Math.abs(dx)) {
        pointerRef.current = null // vertical: let the page scroll
        return
      }
      p.active = true
      try {
        e.currentTarget.setPointerCapture(e.pointerId)
      } catch {
        // capture is best-effort
      }
    }
    setDrag({ dx, active: true, returning: false })
  }

  const endDrag = (e, cancelled) => {
    const p = pointerRef.current
    pointerRef.current = null
    if (!p || p.id !== e.pointerId || !p.active) return
    suppressClickUntilRef.current = Date.now() + 400
    const dx = e.clientX - p.x
    if (!cancelled && dx <= -SWIPE_THRESHOLD) rate(false)
    else if (!cancelled && dx >= SWIPE_THRESHOLD) rate(true)
    else setDrag({ dx: 0, active: false, returning: true })
  }

  const onCardClick = () => {
    if (Date.now() < suppressClickUntilRef.current) return // the tap ended a swipe
    flip()
  }

  // ---- render ----
  const progress = total > 0 ? done / total : 0
  const showSpeak = current && (direction === 'fr-en' || flipped)

  if (finished) {
    const pct = total > 0 ? firstTry / total : 0
    const missedCount = missed.size
    return (
      <div className={styles.end}>
        <div className={styles.endEmoji} aria-hidden="true">
          {pct === 1 ? '🏆' : pct >= 0.6 ? '🎉' : '💪'}
        </div>
        <h2 ref={endHeadingRef} tabIndex={-1} className={styles.endTitle}>
          Deck complete!
        </h2>
        <p className={styles.endScore}>
          Got it on first try: <strong>{firstTry}/{total}</strong>
        </p>
        <div className={styles.endBar} aria-hidden="true">
          <span className={styles.endBarFill} style={{ transform: `scaleX(${pct})` }} />
        </div>
        <div className={styles.endActions}>
          {missedCount > 0 && (
            <button type="button" className={`${ui.btn} ${ui.orange} ${ui.block}`} onClick={() => start([...missed])}>
              Practice only the ones I missed ({missedCount})
            </button>
          )}
          <button
            type="button"
            className={`${ui.btn} ${missedCount > 0 ? ui.ghost : ui.blue} ${ui.block}`}
            onClick={() => start(items.map((i) => i.key))}
          >
            Restart
          </button>
        </div>
        <div className="sr-only" aria-live="polite">
          {`Deck complete. Got it on first try: ${firstTry} of ${total}.`}
        </div>
      </div>
    )
  }

  const dx = drag.dx
  const stampOpacity = Math.min(1, Math.abs(dx) / SWIPE_THRESHOLD)

  return (
    <div className={styles.session}>
      <div className={styles.toolbar}>
        <div className={styles.dirToggle} role="group" aria-label="Card direction">
          {[
            ['fr-en', 'FR → EN'],
            ['en-fr', 'EN → FR'],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              className={cx(styles.dirBtn, direction === value && styles.dirActive)}
              aria-pressed={direction === value}
              onClick={() => changeDirection(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <p className={styles.count}>
          <strong>{done}</strong> / {total}
        </p>
      </div>

      <div
        className={styles.progress}
        role="progressbar"
        aria-label="Cards done"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-valuetext={`${done} of ${total} cards done`}
      >
        <span className={styles.progressFill} style={{ transform: `scaleX(${progress})` }} />
      </div>

      <div className={styles.stage}>
        {current ? (
          <button
            ref={cardRef}
            type="button"
            className={cx(
              styles.card,
              flipped && styles.flipped,
              drag.active && styles.dragging,
              drag.returning && styles.returning
            )}
            style={{ '--dx': `${dx}px`, '--rot': `${dx / 18}deg` }}
            aria-pressed={flipped}
            aria-label={
              flipped
                ? `${back.label}: ${back.plain}${current.example ? `. Example: ${plainText(current.example)}` : ''}. Press to see the ${front.label} side again.`
                : `${front.label}: ${front.plain}. Press to reveal the ${back.label}.`
            }
            onClick={onCardClick}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={(e) => endDrag(e, false)}
            onPointerCancel={(e) => endDrag(e, true)}
          >
            <span key={turn} className={styles.inner}>
              <span className={cx(styles.face, styles.front)} aria-hidden="true">
                <span className={styles.faceLabel}>
                  {front.flag} {front.label}
                </span>
                <span className={cx(styles.faceText, sizeClass(front.text))} lang={front.lang}>
                  <RichTextInline text={front.text} />
                </span>
                <span className={styles.faceHint}>Tap to flip</span>
              </span>
              <span className={cx(styles.face, styles.back)} aria-hidden="true">
                <span className={styles.faceLabel}>
                  {back.flag} {back.label}
                </span>
                <span className={cx(styles.faceText, sizeClass(back.text))} lang={back.lang}>
                  <RichTextInline text={back.text} />
                </span>
                {current.example && (
                  <span className={styles.faceExample} lang="fr">
                    <RichTextInline text={current.example} />
                  </span>
                )}
              </span>
            </span>
            {dx !== 0 && (
              <span
                className={cx(styles.stamp, dx < 0 ? styles.stampAgain : styles.stampGot)}
                style={{ opacity: stampOpacity }}
                aria-hidden="true"
              >
                {dx < 0 ? 'Again' : 'Got it'}
              </span>
            )}
          </button>
        ) : (
          <span className={`${ui.skel} ${styles.cardSkel}`} aria-hidden="true" />
        )}
      </div>

      <div className={styles.under}>
        {showSpeak && <SpeakButton speech={speech} text={plainText(current.fr)} speakKey={`card:${current.key}`} />}
        <p className={styles.hint}>
          <span className={styles.hintTouch}>Swipe ← again · → got it</span>
          <span className={styles.hintKeys}>
            <kbd>Space</kbd> flip · <kbd>1</kbd> again · <kbd>2</kbd> got it
          </span>
        </p>
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          className={`${ui.btn} ${ui.red} ${styles.actionBtn}`}
          onClick={() => rateFromButton(false)}
          disabled={!current}
        >
          <span aria-hidden="true">↺</span> Again
        </button>
        <button
          type="button"
          className={`${ui.btn} ${ui.green} ${styles.actionBtn}`}
          onClick={() => rateFromButton(true)}
          disabled={!current}
        >
          <span aria-hidden="true">✓</span> Got it
        </button>
      </div>

      <div className="sr-only" aria-live="polite">
        {live}
      </div>
    </div>
  )
}
