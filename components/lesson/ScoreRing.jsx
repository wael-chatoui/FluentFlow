import { percent } from '@/components/lesson/format'
import styles from '@/components/lesson/StudentPages.module.css'

/** Small circular progress ring showing a best score (e.g. 6/8 → 75%). */
export default function ScoreRing({ score, total, size = 48 }) {
  const pct = percent(score, total) ?? 0
  const stroke = 5
  const r = (size - stroke) / 2
  const circumference = 2 * Math.PI * r
  const color = pct >= 80 ? '#10b981' : pct >= 50 ? '#f4b400' : '#ef4444'

  return (
    <span
      className={styles.ring}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Best score ${score} out of ${total} (${pct}%)`}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--gray-200)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct / 100)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className={styles.ringText} aria-hidden="true">{pct}%</span>
    </span>
  )
}
