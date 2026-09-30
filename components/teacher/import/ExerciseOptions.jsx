import { useId } from 'react'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import {
  COUNT_MAX,
  COUNT_MIN,
  EXERCISE_TYPES,
  MAX_INSTRUCTIONS,
  formatCount,
} from '@/components/teacher/import/importUtils'
import styles from '@/components/teacher/import/ExerciseOptions.module.css'

/** Parses the count field → integer in range, or null. */
export function parseCount(value) {
  const n = Number(value)
  return Number.isInteger(n) && n >= COUNT_MIN && n <= COUNT_MAX ? n : null
}

/** Validation errors of the options (French), keyed by field. */
export function optionErrors(options) {
  const e = {}
  if (parseCount(options.count) === null) e.count = `Choisis entre ${COUNT_MIN} et ${COUNT_MAX} exercices.`
  if (!options.types.length) e.types = "Choisis au moins un type d'exercice."
  if (options.instructions.length > MAX_INSTRUCTIONS) e.instructions = `${formatCount(MAX_INSTRUCTIONS)} caractères maximum.`
  return e
}

/** Body sent to the API as `options`. */
export function buildOptions(options) {
  const body = {
    count: parseCount(options.count),
    types: EXERCISE_TYPES.map((t) => t.value).filter((v) => options.types.includes(v)),
  }
  const instructions = options.instructions.trim()
  if (instructions) body.instructions = instructions
  return body
}

/**
 * Exercise settings: count stepper, exercise type toggles and optional
 * instructions for the AI. Used by the import page (every document of the run),
 * the new-lesson form and the regenerate editor, which pass their own `hint`.
 * @param {{ value: { count: string, types: string[], instructions: string },
 *   onChange: React.Dispatch<React.SetStateAction<object>>, disabled?: boolean,
 *   hint?: string|null }} props  hint: text under the block (null = none)
 */
export default function ExerciseOptions({
  value,
  onChange,
  disabled = false,
  hint = "Ces réglages s'appliquent à tous les documents de cet import.",
}) {
  const uid = useId()
  const errors = optionErrors(value)
  const count = parseCount(value.count)

  // Functional updates (onChange is a state setter): each change starts from the
  // latest options, so quick successive clicks never overwrite each other.
  const set = (patch) => onChange((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }))
  const step = (delta) =>
    set((prev) => {
      const base = parseCount(prev.count) ?? COUNT_MIN
      return { count: String(Math.min(COUNT_MAX, Math.max(COUNT_MIN, base + delta))) }
    })
  const toggleType = (type) =>
    set((prev) => ({
      types: prev.types.includes(type) ? prev.types.filter((t) => t !== type) : [...prev.types, type],
    }))

  const countId = `${uid}-count`
  const typesId = `${uid}-types`
  const instrId = `${uid}-instructions`
  const instrLen = value.instructions.length

  return (
    <div className={styles.options}>
      <div className={styles.field}>
        <label htmlFor={countId} className={bits.label}>
          Nombre d&apos;exercices par leçon
        </label>
        <div className={styles.stepper}>
          <button
            type="button"
            className={styles.stepBtn}
            onClick={() => step(-1)}
            disabled={disabled || (count !== null && count <= COUNT_MIN)}
            aria-label="Un exercice de moins"
            aria-controls={countId}
          >
            −
          </button>
          <input
            id={countId}
            type="number"
            inputMode="numeric"
            min={COUNT_MIN}
            max={COUNT_MAX}
            step={1}
            className={`${bits.input} ${styles.countInput} ${errors.count ? bits.invalid : ''}`}
            value={value.count}
            onChange={(e) => set({ count: e.target.value })}
            onBlur={() => {
              const n = Math.round(Number(value.count))
              if (Number.isFinite(n) && value.count !== '') {
                set({ count: String(Math.min(COUNT_MAX, Math.max(COUNT_MIN, n))) })
              }
            }}
            disabled={disabled}
            aria-invalid={Boolean(errors.count) || undefined}
            aria-describedby={errors.count ? `${countId}-error` : `${countId}-hint`}
          />
          <button
            type="button"
            className={styles.stepBtn}
            onClick={() => step(1)}
            disabled={disabled || (count !== null && count >= COUNT_MAX)}
            aria-label="Un exercice de plus"
            aria-controls={countId}
          >
            +
          </button>
        </div>
        {errors.count ? (
          <p id={`${countId}-error`} className={bits.fieldError}>
            <span aria-hidden="true">⚠️</span> {errors.count}
          </p>
        ) : (
          <p id={`${countId}-hint`} className={bits.hint}>
            Entre {COUNT_MIN} et {COUNT_MAX}.
          </p>
        )}
      </div>

      <div className={styles.field}>
        <p id={typesId} className={bits.label}>
          Types d&apos;exercices
        </p>
        <div
          className={styles.chips}
          role="group"
          aria-labelledby={typesId}
          aria-describedby={errors.types ? `${typesId}-error` : undefined}
        >
          {EXERCISE_TYPES.map((t) => {
            const on = value.types.includes(t.value)
            return (
              <button
                key={t.value}
                type="button"
                className={`${styles.chip} ${on ? styles.chipOn : ''}`}
                aria-pressed={on}
                onClick={() => toggleType(t.value)}
                disabled={disabled}
              >
                <span className={styles.chipCheck} aria-hidden="true">{on ? '✓' : t.icon}</span>
                {t.label}
              </button>
            )
          })}
        </div>
        {errors.types && (
          <p id={`${typesId}-error`} className={bits.fieldError} role="alert">
            <span aria-hidden="true">⚠️</span> {errors.types}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <div className={styles.labelRow}>
          <label htmlFor={instrId} className={bits.label}>
            Consignes pour l&apos;IA <span className={bits.optional}>(facultatif)</span>
          </label>
          <span
            className={`${styles.counter} ${errors.instructions ? styles.counterOver : ''}`}
            id={`${instrId}-count`}
          >
            {formatCount(instrLen)} / {formatCount(MAX_INSTRUCTIONS)}
          </span>
        </div>
        <textarea
          id={instrId}
          className={`${bits.textarea} ${styles.instructions} ${errors.instructions ? bits.invalid : ''}`}
          value={value.instructions}
          onChange={(e) => set({ instructions: e.target.value })}
          rows={3}
          maxLength={MAX_INSTRUCTIONS}
          placeholder="Ex : insiste sur le subjonctif, phrases courtes"
          disabled={disabled}
          aria-invalid={Boolean(errors.instructions) || undefined}
          aria-describedby={`${instrId}-count`}
        />
        {hint && <p className={bits.hint}>{hint}</p>}
      </div>
    </div>
  )
}
