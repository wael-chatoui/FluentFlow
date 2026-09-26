import styles from '@/components/teacher/Teacher.module.css'

/** Shimmering placeholder block. */
export default function Skeleton({ width = '100%', height = 14, radius, style, className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.skeleton} ${className}`}
      style={{ width, maxWidth: '100%', height, borderRadius: radius, flexShrink: 0, ...style }}
    />
  )
}
