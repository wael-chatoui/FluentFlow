import { useId, useState } from 'react'
import ExerciseOptions, { buildOptions, optionErrors } from '@/components/teacher/import/ExerciseOptions'
import { COUNT_DEFAULT, EXERCISE_TYPES } from '@/components/teacher/import/importUtils'
import styles from '@/components/teacher/lessons/OptionsDisclosure.module.css'

/** Form value of fixed exercise options before the teacher changes anything. */
export const DEFAULT_OPTIONS = Object.freeze({
  count: String(COUNT_DEFAULT),
  types: EXERCISE_TYPES.map((t) => t.value),
  instructions: '',
})

// `auto: true` = no options sent: for a transcript the AI picks the count and the mix
// (utils/ai/prompt.js DEFAULT_MIX: 10–14 exercises, about 60 % MCQ). Any fixed setting,
// even 10 exercises, is sent as is and asked EXACTLY.
const AUTO_SUMMARY = "l'IA choisit (10 à 14 exercices, surtout des QCM)"

/** New transcript lesson: the AI chooses (the fixed values are shown once unticked). */
export function autoOptions() {
  return { ...DEFAULT_OPTIONS, types: [...DEFAULT_OPTIONS.types], auto: true }
}

/**
 * Options stored with a lesson (`generation_options`) → form value.
 * @param {object | null} stored
 * @param {{ auto?: boolean }} [params]  auto: nothing stored means "the AI chose" (transcript
 *   lessons); otherwise the defaults apply (imports always get fixed options)
 */
export function optionsFromStored(stored, { auto = false } = {}) {
  if (!stored || typeof stored !== 'object') return { ...autoOptions(), auto }
  const known = EXERCISE_TYPES.map((t) => t.value)
  const types = Array.isArray(stored.types) ? known.filter((t) => stored.types.includes(t)) : []
  return {
    count: Number.isInteger(stored.count) ? String(stored.count) : DEFAULT_OPTIONS.count,
    types: types.length ? types : [...DEFAULT_OPTIONS.types],
    instructions: typeof stored.instructions === 'string' ? stored.instructions : '',
    auto: false,
  }
}

/**
 * Options saved in a new-lesson draft → form value. Drafts saved before `auto` existed did
 * not send unchanged defaults: those mean "the AI chooses".
 */
export function draftOptions(saved) {
  if (!saved) return autoOptions()
  if (typeof saved.auto === 'boolean') return { ...saved, types: [...saved.types] }
  return { ...saved, types: [...saved.types], auto: sameOptions(saved, DEFAULT_OPTIONS) }
}

/** True when both form values would send the same fixed options to the API. */
export function sameOptions(a, b) {
  return JSON.stringify(buildOptions(a)) === JSON.stringify(buildOptions(b))
}

/** Body sent as `options`, or null when the AI chooses. */
export function optionsToSend(value) {
  return value.auto ? null : buildOptions(value)
}

/** Regeneration: must `options` be sent? (Leaving « l'IA choisit » for fixed options is a change.) */
export function optionsChanged(value, initial) {
  if (value.auto) return false
  return Boolean(initial.auto) || !sameOptions(value, initial)
}

export function hasOptionErrors(value) {
  return !value.auto && Object.keys(optionErrors(value)).length > 0
}

/** Short summary: '10 exercices · QCM, Association · consignes'. */
export function summarizeOptions(value) {
  const labels = EXERCISE_TYPES.filter((t) => value.types.includes(t.value)).map((t) => t.label)
  const parts = [`${value.count || '?'} exercices`, labels.join(', ') || 'aucun type']
  if (value.instructions.trim()) parts.push('consignes')
  return parts.join(' · ')
}

/**
 * Text under « Options des exercices »: what the next generation will actually ask for.
 * @param {object} value
 * @param {boolean} allowAuto  the form offers « Laisser l'IA choisir »
 */
export function optionsSummary(value, allowAuto) {
  if (value.auto) return `Par défaut : ${AUTO_SUMMARY}`
  if (!allowAuto && sameOptions(value, DEFAULT_OPTIONS)) return `Par défaut : ${summarizeOptions(value)}`
  return summarizeOptions(value)
}

/**
 * Collapsible "Options des exercices" block around the import page's ExerciseOptions.
 * With `allowAuto`, a first choice « Laisser l'IA choisir » (nothing sent) hides the fixed
 * settings. Opens by itself when the options are invalid (so the errors are visible).
 * @param {{ value: object, onChange: React.Dispatch<React.SetStateAction<object>>, disabled?: boolean,
 *   defaultOpen?: boolean, hint?: string, allowAuto?: boolean }} props
 */
export default function OptionsDisclosure({ value, onChange, disabled = false, defaultOpen = false, hint, allowAuto = false }) {
  const uid = useId()
  const [open, setOpen] = useState(defaultOpen)
  const invalid = hasOptionErrors(value)
  const expanded = open || invalid
  const auto = allowAuto && Boolean(value.auto)

  return (
    <div className={`${styles.box} ${expanded ? styles.open : ''}`}>
      <button
        type="button"
        className={styles.toggle}
        aria-expanded={expanded}
        aria-controls={`${uid}-panel`}
        onClick={() => !invalid && setOpen((o) => !o)}
      >
        <span className={styles.icon} aria-hidden="true">⚙️</span>
        <span className={styles.text}>
          <span className={styles.title}>Options des exercices</span>
          <span className={styles.summary}>{optionsSummary(value, allowAuto)}</span>
        </span>
        <span className={styles.chevron} aria-hidden="true" />
      </button>
      <div id={`${uid}-panel`} className={styles.panel} hidden={!expanded}>
        {allowAuto && (
          <label className={styles.auto}>
            <input
              type="checkbox"
              checked={auto}
              onChange={(e) => {
                const { checked } = e.target
                onChange((prev) => ({ ...prev, auto: checked }))
              }}
              disabled={disabled}
            />
            <span className={styles.autoText}>
              <span className={styles.autoTitle}>Laisser l&apos;IA choisir</span>
              <span className={styles.autoHint}>
                10 à 14 exercices selon le cours, surtout des QCM, avec des textes à trous et des associations.
                Décoche pour fixer le nombre exact, les types ou donner des consignes.
              </span>
            </span>
          </label>
        )}
        {!auto && <ExerciseOptions value={value} onChange={onChange} disabled={disabled} hint={hint} />}
      </div>
    </div>
  )
}
