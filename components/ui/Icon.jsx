// Pictogram from lucide-react with the app's defaults. Decorative by default
// (aria-hidden); pass `label` when the icon alone carries meaning (e.g. an icon button).
//   import { BookOpen } from 'lucide-react'
//   <Icon icon={BookOpen} size={20} />
export default function Icon({ icon: Glyph, size = 20, strokeWidth = 2.25, label, className, ...rest }) {
  if (!Glyph) return null
  return (
    <Glyph
      size={size}
      strokeWidth={strokeWidth}
      className={className}
      focusable="false"
      {...(label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
      {...rest}
    />
  )
}
