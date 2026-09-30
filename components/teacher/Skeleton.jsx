import ui from '@/components/ui/ui.module.css'

/** Shimmering placeholder block (the app-wide ui.skel shimmer). */
export default function Skeleton({ width = '100%', height = 14, radius, style, className = '' }) {
  return (
    <span
      aria-hidden="true"
      className={`${ui.skel} ${className}`}
      style={{ width, maxWidth: '100%', height, borderRadius: radius, flexShrink: 0, ...style }}
    />
  )
}
