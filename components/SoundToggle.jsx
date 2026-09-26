import { useSoundEnabled } from '@/utils/sound'

/**
 * Speaker button that turns the UI sound effects on/off (saved on this device).
 * @param {{ className?: string }} props
 */
export default function SoundToggle({ className }) {
  const [enabled, setEnabled] = useSoundEnabled()
  return (
    <button
      type="button"
      className={className}
      onClick={() => setEnabled(!enabled)}
      aria-pressed={enabled}
      aria-label={enabled ? 'Sound effects on — turn off' : 'Sound effects off — turn on'}
      title={enabled ? 'Sound on' : 'Sound off'}
    >
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" />
        {enabled ? (
          <>
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
          </>
        ) : (
          <path d="m16 9 6 6m0-6-6 6" />
        )}
      </svg>
    </button>
  )
}
