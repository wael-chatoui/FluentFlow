import styles from '@/components/student/lessons/MasteryRing.module.css'

/**
 * Circular progress ring (0–100%). Color comes from the `--ring` CSS variable
 * (defaults to green), so callers can pass an accent via `style`.
 * @param {{ pct: number|null, size?: number, stroke?: number, label: string, style?: object, children?: React.ReactNode }} props
 */
export default function MasteryRing({ pct, size = 56, stroke = 7, label, style, children }) {
  const value = Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r

  return (
    <span className={styles.ring} style={{ width: size, height: size, ...style }} role="img" aria-label={label}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle className={styles.track} cx={size / 2} cy={size / 2} r={r} strokeWidth={stroke} />
        {value > 0 && (
          <circle
            className={styles.value}
            cx={size / 2}
            cy={size / 2}
            r={r}
            strokeWidth={stroke}
            strokeDasharray={circumference}
            strokeDashoffset={circumference * (1 - value / 100)}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ '--ring-len': circumference }}
          />
        )}
      </svg>
      <span className={styles.center} aria-hidden="true">
        {children ?? (Number.isFinite(pct) ? `${value}%` : '—')}
      </span>
    </span>
  )
}
