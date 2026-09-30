import { useSoundEnabled } from '@/utils/sound'
import { Volume2, VolumeX } from 'lucide-react'
import Icon from '@/components/ui/Icon'

/**
 * Speaker toggle button for the UI sound effects (saved on this device).
 * The accessible name stays the same; aria-pressed carries the on/off state.
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
      aria-label="Sound effects"
      title={enabled ? 'Sound effects: on' : 'Sound effects: off'}
    >
      <Icon icon={enabled ? Volume2 : VolumeX} size={24} />
    </button>
  )
}
