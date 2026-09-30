import styles from '@/components/student/vocabulary/Vocabulary.module.css'
import { Volume1, Volume2 } from 'lucide-react'
import Icon from '@/components/ui/Icon'

/**
 * Round "listen" button. Renders nothing without a French voice (see useFrenchSpeech).
 * @param {{ speech: { supported: boolean, speak: Function, speakingKey: string|null },
 *   text: string, speakKey?: string, className?: string }} props
 */
export default function SpeakButton({ speech, text, speakKey, className }) {
  if (!speech?.supported || !text) return null
  const key = speakKey || text
  const speaking = speech.speakingKey === key
  return (
    <button
      type="button"
      className={`${styles.speakBtn} ${speaking ? styles.speaking : ''} ${className || ''}`}
      onClick={(e) => {
        e.stopPropagation()
        speech.speak(text, key)
      }}
      aria-label={`Listen: ${text}`}
    >
      <Icon icon={speaking ? Volume2 : Volume1} size={20} />
    </button>
  )
}
