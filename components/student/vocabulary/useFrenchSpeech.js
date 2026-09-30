import { useCallback, useEffect, useRef, useState } from 'react'

function getSynth() {
  if (typeof window === 'undefined') return null
  if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') return null
  return window.speechSynthesis
}

function findFrenchVoice(synth) {
  const voices = synth.getVoices?.() || []
  return voices.find((v) => /^fr[-_]fr/i.test(v.lang)) || voices.find((v) => /^fr([-_]|$)/i.test(v.lang)) || null
}

/**
 * French text-to-speech with the Web Speech API.
 * `supported` is true only once a French voice is installed: without one, browsers read
 * French with an English voice, which is worse than nothing for a pronunciation aid.
 * It is false during SSR and the first client render (hydration-safe), and can turn true
 * later (voices load asynchronously). Speech is cancelled on unmount.
 * @returns {{ supported: boolean, speak: (text: string, key?: string) => void, speakingKey: string | null }}
 */
export default function useFrenchSpeech() {
  const [supported, setSupported] = useState(false)
  const [speakingKey, setSpeakingKey] = useState(null)
  const mountedRef = useRef(false)
  const voiceRef = useRef(null)

  useEffect(() => {
    mountedRef.current = true
    const synth = getSynth()
    if (!synth) {
      return () => {
        mountedRef.current = false
      }
    }

    const pickVoice = () => {
      voiceRef.current = findFrenchVoice(synth)
      if (mountedRef.current) setSupported(Boolean(voiceRef.current))
    }
    pickVoice()
    synth.addEventListener?.('voiceschanged', pickVoice)

    return () => {
      mountedRef.current = false
      synth.removeEventListener?.('voiceschanged', pickVoice)
      synth.cancel()
    }
  }, [])

  const speak = useCallback((text, key = text) => {
    const synth = getSynth()
    const value = typeof text === 'string' ? text.replace(/\*\*/g, '').trim() : ''
    if (!synth || !value || !voiceRef.current) return
    synth.cancel()
    const utterance = new window.SpeechSynthesisUtterance(value)
    utterance.lang = voiceRef.current.lang || 'fr-FR'
    utterance.voice = voiceRef.current
    utterance.rate = 0.9
    const done = () => {
      if (mountedRef.current) setSpeakingKey((k) => (k === key ? null : k))
    }
    utterance.onend = done
    utterance.onerror = done
    setSpeakingKey(key)
    synth.speak(utterance)
  }, [])

  return { supported, speak, speakingKey }
}
