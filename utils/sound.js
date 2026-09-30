// Small UI sound effects, synthesized with the Web Audio API (no audio files).
//
//   playSound('correct' | 'wrong' | 'almost' | 'pair' | 'pairWrong' | 'complete' | 'perfect' | 'flip' | 'select')
//
// The AudioContext is created lazily on the first sound, which always follows a
// user gesture (click / key), so browsers (incl. iOS Safari) allow playback.
// The on/off preference is stored per device in localStorage and shared live by
// every component (and every tab) through useSoundEnabled().
import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'preply:sound'
const MASTER_VOLUME = 0.22

let ctx = null
let master = null
let enabledCache = null // null = not read yet (also keeps the choice when storage is blocked)
const listeners = new Set()

function readEnabled() {
  if (enabledCache === null) {
    try {
      enabledCache = localStorage.getItem(STORAGE_KEY) !== 'off'
    } catch {
      enabledCache = true
    }
  }
  return enabledCache
}

export function isSoundEnabled() {
  return typeof window !== 'undefined' && readEnabled()
}

export function setSoundEnabled(enabled) {
  enabledCache = Boolean(enabled)
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    // Storage blocked: the setting just won't persist
  }
  listeners.forEach((fn) => fn())
  if (enabled) playSound('select')
}

function subscribe(onChange) {
  listeners.add(onChange)
  // Another tab changed the setting
  const onStorage = (e) => {
    if (e.key !== STORAGE_KEY && e.key !== null) return
    enabledCache = null
    onChange()
  }
  window.addEventListener('storage', onStorage)
  return () => {
    listeners.delete(onChange)
    window.removeEventListener('storage', onStorage)
  }
}

/** [enabled, setEnabled] — stays in sync across every component and tab. On by default (and on the server). */
export function useSoundEnabled() {
  const enabled = useSyncExternalStore(subscribe, readEnabled, () => true)
  return [enabled, setSoundEnabled]
}

function audio() {
  if (typeof window === 'undefined') return null
  if (!ctx || ctx.state === 'closed') {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    ctx = new AudioCtx()
    master = ctx.createGain()
    master.gain.value = MASTER_VOLUME
    master.connect(ctx.destination)
  }
  // 'suspended' (autoplay policy) or iOS's 'interrupted' (call, Siri, background)
  if (ctx.state !== 'running') ctx.resume().catch(() => {})
  return ctx
}

/**
 * One enveloped oscillator note.
 * @param {number} at      start offset in seconds
 * @param {number} freq    start frequency (Hz)
 * @param {number} dur     duration (s)
 * @param {{ type?: OscillatorType, to?: number, gain?: number }} [o]  to = end frequency (glide)
 */
function tone(at, freq, dur, { type = 'sine', to, gain = 1 } = {}) {
  const t0 = ctx.currentTime + at
  const osc = ctx.createOscillator()
  const env = ctx.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  if (to) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur)
  env.gain.setValueAtTime(0.0001, t0)
  env.gain.exponentialRampToValueAtTime(gain, t0 + 0.012)
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(env)
  env.connect(master)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

const SOUNDS = {
  // Bright rising two-note chime
  correct: () => {
    tone(0, 784, 0.12, { type: 'triangle', gain: 0.9 })
    tone(0.09, 1175, 0.22, { type: 'triangle', gain: 0.9 })
  },
  // Soft low descending "bonk"
  wrong: () => {
    tone(0, 330, 0.16, { type: 'triangle', to: 220, gain: 0.8 })
    tone(0.13, 247, 0.24, { type: 'triangle', to: 165, gain: 0.7 })
  },
  // Accepted with a caveat (accents, match with mistakes)
  almost: () => {
    tone(0, 659, 0.12, { type: 'triangle', gain: 0.7 })
    tone(0.1, 784, 0.18, { type: 'triangle', gain: 0.6 })
  },
  // Match: a pair locks in
  pair: () => tone(0, 660, 0.09, { type: 'sine', to: 990, gain: 0.8 }),
  // Match: wrong pairing
  pairWrong: () => tone(0, 200, 0.12, { type: 'triangle', to: 150, gain: 0.7 }),
  // End of a practice run
  complete: () => {
    ;[523, 659, 784].forEach((f, i) => tone(i * 0.1, f, 0.18, { type: 'triangle', gain: 0.8 }))
    tone(0.3, 1047, 0.45, { type: 'triangle', gain: 0.8 })
  },
  // End of a run with every answer right the first time
  perfect: () => {
    ;[523, 659, 784, 1047].forEach((f, i) => tone(i * 0.09, f, 0.16, { type: 'triangle', gain: 0.8 }))
    tone(0.36, 1319, 0.5, { type: 'triangle', gain: 0.8 })
    tone(0.36, 1047, 0.5, { type: 'sine', gain: 0.4 })
  },
  // Flashcard flip
  flip: () => tone(0, 900, 0.06, { type: 'triangle', to: 1400, gain: 0.35 }),
  // Choosing an option
  select: () => tone(0, 520, 0.05, { type: 'sine', gain: 0.35 }),
}

export function playSound(name) {
  if (!isSoundEnabled() || !SOUNDS[name]) return
  try {
    if (!audio()) return
    SOUNDS[name]()
  } catch {
    // Audio is a nice-to-have: never let it break the UI
  }
}
