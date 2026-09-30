// Practice run state machine (pure: no React, no DOM), used by PracticePlayer
// and unit-tested in tests/practice.test.js and tests/practice-fixes.test.js.
//
// A run plays a queue of exercise ids. A wrong answer re-queues the exercise at
// the end (a match is never re-queued: it always ends with every pair found).
// Only the FIRST attempt at each exercise counts for the score, so the score is
// final as soon as every exercise has a first attempt (`isScoreFinal`), even if
// re-queued mistakes remain.
//
// State: { items, runId, queue, pos, turn, answer, feedback, first, phase, retry, resumed }
//   queue[pos]  the current exercise; ids in queue[pos..] are always distinct
//   feedback    graded answer shown after "Check" ({ correct, accentWarning, expected, value }) or null
//   first       first attempts, in order: [{ exerciseId, value, correct }]
//   phase       'play' | 'done'
//   retry       the current screen is a previous mistake
//   resumed     restored from a snapshot, until the first "Continue"
import { gradeAnswer } from '@/utils/lesson/grading'

const SNAPSHOT_VERSION = 1

/** Random v4 UUID (crypto.randomUUID when available). Identifies one run for idempotent saves. */
export function newRunId() {
  const c = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  const bytes = new Uint8Array(16)
  if (c && typeof c.getRandomValues === 'function') c.getRandomValues(bytes)
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/** Short hash of the exercises: a saved run is only resumed on the exact same exercises. */
export function fingerprint(items) {
  const s = JSON.stringify(items) || ''
  let h = 0x811c9dc5 // FNV-1a, 32 bits
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(36)
}

export function createRun(items, runId) {
  return {
    items,
    runId,
    queue: items.map((e) => e.id),
    pos: 0,
    turn: 0,
    answer: null,
    feedback: null,
    first: [],
    phase: items.length ? 'play' : 'done',
    retry: false,
    resumed: false,
  }
}

const hasFirst = (state, id) => state.first.some((a) => a.exerciseId === id)

export function currentExercise(state) {
  if (state.phase !== 'play') return null
  const id = state.queue[state.pos]
  return state.items.find((e) => e.id === id) || null
}

/** Exercises finished (answered right at some point, or a completed match). */
export function doneCount(state) {
  if (state.phase === 'done') return state.items.length
  const remaining = state.queue.length - state.pos - (state.feedback ? 1 : 0)
  return Math.max(0, state.items.length - remaining)
}

/** Every exercise has a first attempt: the score can no longer change. */
export function isScoreFinal(state) {
  return state.items.length > 0 && state.first.length === state.items.length
}

/** First attempts in the shape onComplete / the API expect. */
export function firstAnswers(state) {
  return state.first.map(({ exerciseId, value }) => ({ exerciseId, value }))
}

export function runReducer(state, action) {
  switch (action.type) {
    case 'answer': {
      if (state.phase !== 'play' || state.feedback) return state
      return { ...state, answer: action.value }
    }
    case 'check': {
      const exercise = currentExercise(state)
      if (!exercise || state.feedback) return state
      const grade = gradeAnswer(exercise, action.value)
      const first = hasFirst(state, exercise.id)
        ? state.first
        : [...state.first, { exerciseId: exercise.id, value: action.value, correct: grade.correct }]
      const completed = grade.correct || exercise.type === 'match'
      return {
        ...state,
        answer: action.value,
        first,
        queue: completed ? state.queue : [...state.queue, exercise.id],
        feedback: { ...grade, value: action.value },
      }
    }
    case 'continue': {
      if (state.phase !== 'play' || !state.feedback) return state
      const pos = state.pos + 1
      const base = { ...state, answer: null, feedback: null, resumed: false }
      if (pos >= state.queue.length) return { ...base, phase: 'done', retry: false }
      return { ...base, pos, turn: state.turn + 1, retry: hasFirst(state, state.queue[pos]) }
    }
    default:
      return state
  }
}

// ---- input timing ----
// "Continue" appears where "Check" was (full width at the bottom on phones, right-aligned
// on desktop, at once with reduced motion): the second click of a double click / double tap
// on Check lands on it and would skip the feedback unread.
export const CONTINUE_LOCK_MS = 400
const MULTI_CLICK_MS = 1000 // longer than any double-click interval the OS allows

/**
 * True when a click on "Continue" most likely belongs to the click that pressed "Check":
 * too soon after the feedback appeared, or the next clicks of the same double click
 * (event.detail > 1). Keyboard activations (detail 0: Enter on the button, in the input or
 * anywhere) are never ignored: holding Enter is already stopped by the player (e.repeat).
 * @param {number} shownAt  when the feedback appeared (performance.now())
 * @param {number} now      performance.now()
 * @param {number} [clicks] the click's event.detail (0 or missing: keyboard)
 */
export function isEarlyContinue(shownAt, now, clicks = 0) {
  if (!(clicks >= 1)) return false
  const elapsed = now - shownAt
  return elapsed < CONTINUE_LOCK_MS || (clicks > 1 && elapsed < MULTI_CLICK_MS)
}

/**
 * What sessionStorage keeps to resume the run after a reload:
 * { v, fp, runId, queue (still to play), firstAnswers, saved, result }.
 * `save` is the player's save state ({ status, result }).
 */
export function toSnapshot(state, save) {
  const saved = save?.status === 'saved'
  return {
    v: SNAPSHOT_VERSION,
    fp: fingerprint(state.items),
    runId: state.runId,
    queue: state.phase === 'done' ? [] : state.queue.slice(state.pos + (state.feedback ? 1 : 0)),
    firstAnswers: state.first,
    saved,
    result: saved && save.result && typeof save.result === 'object' ? save.result : null,
  }
}

/**
 * Rebuilds a run from a snapshot, or null when it doesn't match these exercises
 * (lesson edited, corrupted storage…). Returns { state, save }.
 */
export function restoreRun(items, snapshot) {
  const s = snapshot
  if (!s || typeof s !== 'object' || s.v !== SNAPSHOT_VERSION || s.fp !== fingerprint(items)) return null
  if (typeof s.runId !== 'string' || !s.runId || !Array.isArray(s.queue) || !Array.isArray(s.firstAnswers)) return null

  const ids = new Set(items.map((e) => e.id))
  const queue = s.queue
  if (queue.some((id) => !ids.has(id)) || new Set(queue).size !== queue.length) return null

  const first = []
  for (const a of s.firstAnswers) {
    if (!a || !ids.has(a.exerciseId) || typeof a.correct !== 'boolean' || a.value === undefined) return null
    if (first.some((f) => f.exerciseId === a.exerciseId)) return null
    first.push({ exerciseId: a.exerciseId, value: a.value, correct: a.correct })
  }
  // Every exercise must still be ahead or already attempted, or the score could never be final
  if (items.some((e) => !queue.includes(e.id) && !first.some((f) => f.exerciseId === e.id))) return null

  const state = {
    ...createRun(items, s.runId),
    queue,
    first,
    phase: queue.length ? 'play' : 'done',
    retry: queue.length > 0 && first.some((f) => f.exerciseId === queue[0]),
    resumed: queue.length > 0 && first.length > 0,
  }
  const result = s.saved && s.result && typeof s.result === 'object' ? s.result : null
  return { state, save: s.saved ? { status: 'saved', result, error: '' } : null }
}

/**
 * Whether the run is still worth keeping in sessionStorage to resume it.
 * Never before the first answer, nor once it can't be saved (`outdated`: the lesson was
 * updated). While the player is on screen (a reload never unmounts it): until the end
 * screen of a saved run, so a reload during the retry loop resumes it. Once the player is
 * `gone` (browser back, in-app link…): only while the score still has to be saved — an
 * unfinished run, or a save not sent, in flight or failed (the next visit resumes the run
 * and sends it again with the same runId). A saved run has nothing left to resume.
 * @param {object} state  run state
 * @param {{ status: string }|null} save  the player's save state
 * @param {{ outdated?: boolean, gone?: boolean }} [options]
 */
export function keepSnapshot(state, save, { outdated = false, gone = false } = {}) {
  if (outdated || state.first.length === 0) return false
  const saved = save?.status === 'saved'
  return gone ? !saved : !(saved && state.phase === 'done')
}

// ---- sessionStorage (browser only; storage may be blocked → the run just isn't kept) ----
const STORAGE_PREFIX = 'preply:practice:'

export function loadSnapshot(key) {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_PREFIX + key)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function storeSnapshot(key, snapshot) {
  try {
    window.sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(snapshot))
  } catch {
    // Quota or privacy mode: resuming is a convenience only
  }
}

export function clearSnapshot(key) {
  try {
    window.sessionStorage.removeItem(STORAGE_PREFIX + key)
  } catch {
    // Same as above
  }
}
