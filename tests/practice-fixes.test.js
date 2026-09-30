import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  CONTINUE_LOCK_MS,
  clearSnapshot,
  createRun,
  isEarlyContinue,
  isScoreFinal,
  keepSnapshot,
  loadSnapshot,
  restoreRun,
  runReducer,
  storeSnapshot,
  toSnapshot,
} from '@/components/practice/runState'

const EXERCISES = [
  { id: 'ex_1', type: 'mcq', prompt: 'p', sentence: 'Je ___ allé.', choices: ['suis', 'ai', 'es'], answer: 0, explanation: '' },
  { id: 'ex_2', type: 'fill_blank', prompt: 'p', sentence: 'Elle ___ partie.', answers: ['est'], hint: '', explanation: '' },
]

const check = (s, value) => runReducer(s, { type: 'check', value })
const next = (s) => runReducer(s, { type: 'continue' })

const IDLE = { status: 'idle', result: null, error: '' }
const SAVING = { status: 'saving', result: null, error: '' }
const SAVED = { status: 'saved', result: { score: 1, total: 2, bestScore: 1, bestTotal: 2 }, error: '' }
const FAILED = { status: 'error', result: null, error: 'Network error' }

// Wrong MCQ, right fill-blank: the score is final and the MCQ waits in the retry loop
function retryLoop() {
  const s = next(check(next(check(createRun(EXERCISES, 'run-1'), 1)), 'est'))
  expect(isScoreFinal(s)).toBe(true)
  expect(s.phase).toBe('play')
  expect(s.retry).toBe(true)
  return s
}

describe('isEarlyContinue (double click on Check must not skip the feedback)', () => {
  const shownAt = 10_000

  it('ignores a click that lands on Continue right after Check', () => {
    expect(isEarlyContinue(shownAt, shownAt + 120, 1)).toBe(true) // double tap (touch: detail 1)
    expect(isEarlyContinue(shownAt, shownAt + 150, 2)).toBe(true) // mouse double click
    expect(isEarlyContinue(shownAt, shownAt + CONTINUE_LOCK_MS - 1, 1)).toBe(true)
  })

  it('ignores the rest of a slow double click, not a later one', () => {
    expect(isEarlyContinue(shownAt, shownAt + 600, 2)).toBe(true)
    expect(isEarlyContinue(shownAt, shownAt + 900, 3)).toBe(true)
    expect(isEarlyContinue(shownAt, shownAt + 1500, 2)).toBe(false)
  })

  it('accepts a single click once the lock is over', () => {
    expect(isEarlyContinue(shownAt, shownAt + CONTINUE_LOCK_MS, 1)).toBe(false)
    expect(isEarlyContinue(shownAt, shownAt + 3000, 1)).toBe(false)
  })

  it('never ignores the keyboard (detail 0 or no click event)', () => {
    expect(isEarlyContinue(shownAt, shownAt + 50, 0)).toBe(false)
    expect(isEarlyContinue(shownAt, shownAt + 50)).toBe(false)
    expect(isEarlyContinue(shownAt, shownAt + 50, undefined)).toBe(false)
  })

  it('accepts clicks when no feedback time was recorded', () => {
    expect(isEarlyContinue(-Infinity, 5, 1)).toBe(false)
    expect(isEarlyContinue(-Infinity, 5, 2)).toBe(false)
  })
})

describe('keepSnapshot', () => {
  it('keeps nothing before the first answer, nor an outdated run', () => {
    const fresh = createRun(EXERCISES, 'run-1')
    expect(keepSnapshot(fresh, IDLE)).toBe(false)
    expect(keepSnapshot(fresh, IDLE, { gone: true })).toBe(false)
    const started = next(check(fresh, 1))
    expect(keepSnapshot(started, IDLE)).toBe(true)
    expect(keepSnapshot(started, IDLE, { outdated: true })).toBe(false)
  })

  it('on screen: keeps a saved retry loop (reload resumes it), not a saved end screen', () => {
    const loop = retryLoop()
    expect(keepSnapshot(loop, SAVING)).toBe(true)
    expect(keepSnapshot(loop, SAVED)).toBe(true)
    const done = next(check(loop, 0))
    expect(done.phase).toBe('done')
    expect(keepSnapshot(done, SAVED)).toBe(false)
    expect(keepSnapshot(done, FAILED)).toBe(true)
  })

  it('gone: keeps the run only while its score still has to be saved', () => {
    const loop = retryLoop()
    expect(keepSnapshot(loop, SAVED, { gone: true })).toBe(false)
    expect(keepSnapshot(loop, SAVING, { gone: true })).toBe(true)
    expect(keepSnapshot(loop, FAILED, { gone: true })).toBe(true)
    expect(keepSnapshot(loop, null, { gone: true })).toBe(true)
    // Unfinished run left with the browser back button (after the confirm): resumed next time
    const unfinished = next(check(createRun(EXERCISES, 'run-1'), 0))
    expect(keepSnapshot(unfinished, IDLE, { gone: true })).toBe(true)
  })
})

describe('leaving a saved run with the browser back button (sessionStorage)', () => {
  const KEY = 'lesson:l1:v1'
  let previousWindow

  beforeEach(() => {
    previousWindow = globalThis.window
    const store = new Map()
    globalThis.window = {
      sessionStorage: {
        getItem: (k) => (store.has(k) ? store.get(k) : null),
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: (k) => store.delete(k),
      },
    }
  })

  afterEach(() => {
    if (previousWindow === undefined) delete globalThis.window
    else globalThis.window = previousWindow
  })

  // What the player's storage effect / unmount cleanup do
  const persist = (state, save, options) => {
    if (keepSnapshot(state, save, options)) storeSnapshot(KEY, toSnapshot(state, save))
    else clearSnapshot(KEY)
  }
  const leave = (state, save) => {
    if (!keepSnapshot(state, save, { gone: true })) clearSnapshot(KEY)
  }

  it('a reload during the retry loop still resumes it with the saved score', () => {
    const loop = retryLoop()
    persist(loop, SAVED)
    const restored = restoreRun(EXERCISES, loadSnapshot(KEY))
    expect(restored.state).toMatchObject({ runId: 'run-1', queue: ['ex_1'], resumed: true, retry: true })
    expect(restored.save).toMatchObject({ status: 'saved' })
  })

  it('the next Practice starts a fresh run once the saved player is gone', () => {
    const loop = retryLoop()
    persist(loop, SAVED)
    leave(loop, SAVED)
    expect(loadSnapshot(KEY)).toBeNull()
    expect(restoreRun(EXERCISES, loadSnapshot(KEY))).toBeNull()
  })

  it('a save in flight keeps the run until it settles, then resumes it unsaved if it failed', () => {
    const loop = retryLoop()
    persist(loop, SAVING)
    leave(loop, SAVING)
    const restored = restoreRun(EXERCISES, loadSnapshot(KEY))
    expect(restored.state.runId).toBe('run-1') // saved again with the same runId
    expect(restored.save).toBeNull()
  })
})
