import Icon from '@/components/ui/Icon'
import { CheckIcon } from '@/components/onboarding/Icons'
import steps from '@/components/onboarding/Steps.module.css'
import styles from '@/components/onboarding/ChipGroup.module.css'

/** Multi-select chips backed by native checkboxes (Tab / Space accessible). */
export default function ChipGroup({ name, legend, labelledBy, describedBy, options, selected, onToggle, disabled }) {
  return (
    <fieldset
      className={styles.group}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      disabled={disabled}
    >
      {legend ? <legend className="sr-only">{legend}</legend> : null}
      <div className={styles.chips}>
        {options.map((option) => {
          const checked = selected.includes(option.id)
          const inputId = `${name}-${option.id}`
          return (
            <label key={option.id} htmlFor={inputId} className={`${styles.chip} ${checked ? styles.chipOn : ''}`}>
              <input
                id={inputId}
                className={steps.srInput}
                type="checkbox"
                name={name}
                value={option.id}
                checked={checked}
                onChange={() => onToggle(option.id)}
              />
              <span className={styles.emoji} aria-hidden="true">
                <Icon icon={option.icon} size={17} />
              </span>
              <span className={styles.label}>{option.label}</span>
              <span className={styles.check} aria-hidden="true">
                <CheckIcon size={10} />
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}
