// Each lesson gets a stable accent color (derived from its id), so cards,
// headers and progress bars of the same lesson always match.

export const ACCENTS = ['green', 'blue', 'orange', 'purple', 'pink'] // no red: red means "needs work"

/** @returns {'green'|'blue'|'orange'|'purple'|'pink'} */
export function accentFor(id) {
  const s = String(id || '')
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
  return ACCENTS[h % ACCENTS.length]
}

/** CSS custom properties for an accent, to spread into a `style` prop. */
export function accentStyle(id) {
  const a = accentFor(id)
  return {
    '--accent': `var(--st-${a})`,
    '--accent-dark': `var(--st-${a}-dark)`,
    '--accent-bg': `var(--st-${a}-bg)`,
  }
}
