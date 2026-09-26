import styles from '@/components/student/vocabulary/Vocabulary.module.css'

/**
 * Round "listen" button. Renders nothing when speech isn't supported.
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
      <span aria-hidden="true">{speaking ? '🔊' : '🔈'}</span>
    </button>
  )
}
