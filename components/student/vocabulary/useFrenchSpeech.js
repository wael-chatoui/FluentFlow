import { useCallback, useEffect, useRef, useState } from 'react'

function getSynth() {
  if (typeof window === 'undefined') return null
  if (!('speechSynthesis' in window) || typeof window.SpeechSynthesisUtterance !== 'function') return null
  return window.speechSynthesis
}

/**
 * French text-to-speech with the Web Speech API.
 * `supported` is false during SSR and the first client render (hydration-safe),
 * then true if the browser can speak. Speech is cancelled on unmount.
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
    setSupported(true)

    const pickVoice = () => {
      const voices = synth.getVoices?.() || []
      voiceRef.current =
        voices.find((v) => /^fr[-_]fr/i.test(v.lang)) || voices.find((v) => /^fr/i.test(v.lang)) || null
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
    const value = typeof text === 'string' ? text.trim() : ''
    if (!synth || !value) return
    synth.cancel()
    const utterance = new window.SpeechSynthesisUtterance(value)
    utterance.lang = 'fr-FR'
    utterance.rate = 0.9
    if (voiceRef.current) utterance.voice = voiceRef.current
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
