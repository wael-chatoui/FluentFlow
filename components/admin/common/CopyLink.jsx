import { useId } from 'react'
import ui from '@/components/ui/ui.module.css'
import s from '@/components/admin/common/admin.module.css'
import { useToast } from '@/components/admin/common/Toast'
import { cx } from '@/components/admin/common/format'

/**
 * Read-only field with a one-time sign-in link and a « Copier » button. The text is
 * selected on focus, so it can still be copied by hand when the clipboard is blocked.
 * @param {{ link: string, label?: string, hint?: React.ReactNode }} props
 */
export default function CopyLink({ link, label = 'Lien de connexion', hint }) {
  const id = useId()
  const toast = useToast()

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Lien copié.')
    } catch {
      toast.error('Copie impossible : sélectionne le lien et copie-le à la main.')
    }
  }

  return (
    <div className={s.field}>
      <label htmlFor={id} className={s.label}>
        {label}
      </label>
      <div className={s.copyRow}>
        <input
          id={id}
          className={cx(s.input, s.mono, s.copyInput)}
          value={link}
          readOnly
          spellCheck={false}
          aria-describedby={hint ? `${id}-hint` : undefined}
          onFocus={(e) => e.target.select()}
        />
        <button type="button" className={cx(ui.btn, ui.blue, ui.small, s.tap)} onClick={copy}>
          Copier
        </button>
      </div>
      {hint && (
        <p id={`${id}-hint`} className={s.hint}>
          {hint}
        </p>
      )}
    </div>
  )
}
