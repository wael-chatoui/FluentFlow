import { useEffect, useId, useRef, useState } from 'react'
import { copyText } from '@/components/teacher/clipboard'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/CopyField.module.css'
import { Check, Copy } from 'lucide-react'
import Icon from '@/components/ui/Icon'

/**
 * "Copier" button with a short "Copié ✓" confirmation (announced to screen readers).
 * @param {{ text: string, label?: string, srLabel?: string, className?: string, tone?: 'ghost'|'blue' }} props
 */
export function CopyButton({ text, label = 'Copier', srLabel, className = '', tone = 'ghost' }) {
  const [state, setState] = useState(null) // 'ok' | 'fail' | null
  const timer = useRef(null)

  useEffect(() => () => clearTimeout(timer.current), [])

  const copy = async () => {
    const ok = await copyText(text)
    setState(ok ? 'ok' : 'fail')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setState(null), 2500)
  }

  return (
    <>
      <button
        type="button"
        className={`${ui.btn} ${ui.small} ${bits.tap} ${tone === 'blue' ? ui.blue : bits.blueGhost} ${className}`}
        onClick={copy}
      >
        <Icon icon={state === 'ok' ? Check : Copy} size={18} /> {state === 'ok' ? 'Copié' : label}
        {srLabel && <span className="sr-only"> {srLabel}</span>}
      </button>
      <span className="sr-only" role="status" aria-live="polite">
        {state === 'ok' ? 'Copié dans le presse-papiers.' : state === 'fail' ? 'Copie impossible : sélectionne le texte et copie-le à la main.' : ''}
      </span>
    </>
  )
}

/**
 * Read-only value with a label and a Copier button (links, messages to paste).
 * The text is selected on focus so a manual copy also works.
 * @param {{ label: string, value: string, multiline?: boolean, hint?: React.ReactNode, lang?: string }} props
 *   lang: language of the value when it differs from the page's (e.g. 'en' for a message to a student)
 */
export default function CopyField({ label, value, multiline = false, hint, lang }) {
  const id = useId()
  const Control = multiline ? 'textarea' : 'input'
  return (
    <div className={styles.field}>
      <div className={styles.head}>
        <label htmlFor={id} className={bits.label}>{label}</label>
        <CopyButton text={value} srLabel={label.toLowerCase()} />
      </div>
      <Control
        id={id}
        className={`${multiline ? bits.textarea : bits.input} ${styles.control}`}
        value={value}
        lang={lang}
        readOnly
        rows={multiline ? 5 : undefined}
        onFocus={(e) => e.target.select()}
        spellCheck={false}
        aria-describedby={hint ? `${id}-hint` : undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className={bits.hint}>
          {hint}
        </p>
      )}
    </div>
  )
}
