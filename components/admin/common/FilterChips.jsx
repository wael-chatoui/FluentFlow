import s from '@/components/admin/common/admin.module.css'
import { cx, formatNumber } from '@/components/admin/common/format'

/**
 * Single-choice filter chips (toggle buttons with aria-pressed).
 * @param {{ options: Array<{ value: string, label: string, count?: number }>, value: string,
 *   onChange: (value: string) => void, label?: string, disabled?: boolean }} props
 */
export default function FilterChips({ options, value, onChange, label = 'Filtrer', disabled = false }) {
  return (
    <div className={s.chips} role="group" aria-label={label}>
      {options.map((opt) => {
        const active = opt.value === value
        return (
          <button
            key={opt.value}
            type="button"
            className={cx(s.chip, active && s.chipActive)}
            aria-pressed={active}
            disabled={disabled}
            onClick={() => {
              if (!active) onChange(opt.value)
            }}
          >
            {opt.label}
            {typeof opt.count === 'number' && <span className={s.chipCount}>{formatNumber(opt.count)}</span>}
          </button>
        )
      })}
    </div>
  )
}
