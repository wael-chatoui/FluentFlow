// Small UI sound effects, synthesized with the Web Audio API (no audio files).
//
//   playSound('correct' | 'wrong' | 'almost' | 'pair' | 'pairWrong' | 'complete' | 'perfect' | 'flip' | 'select')
//
// The AudioContext is created lazily on the first sound, which always follows a
// user gesture (click / key), so browsers (incl. iOS Safari) allow playback.
// The on/off preference is stored per device in localStorage.
import { useEffect, useState } from 'react'

const STORAGE_KEY = 'preply:sound'
const MASTER_VOLUME = 0.22

let ctx = null
let master = null
const listeners = new Set()

function readEnabled() {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

export function isSoundEnabled() {
  return typeof window !== 'undefined' && readEnabled()
}

export function setSoundEnabled(enabled) {
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? 'on' : 'off')
  } catch {
    // Storage blocked: the setting just won't persist
  }
  listeners.forEach((fn) => fn(enabled))
  if (enabled) playSound('select')
}

/** [enabled, setEnabled] — stays in sync across every component using it. */
export function useSoundEnabled() {
  const [enabled, setEnabled] = useState(true)
  useEffect(() => {
    setEnabled(readEnabled())
    listeners.add(setEnabled)
    return () => listeners.delete(setEnabled)
  }, [])
  return [enabled, setSoundEnabled]
}

function audio() {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    const AudioCtx = window.AudioContext || window.webkitAudioContext
    if (!AudioCtx) return null
    ctx = new AudioCtx()
    master = ctx.createGain()
    master.gain.value = MASTER_VOLUME
    master.connect(ctx.destination)
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
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
