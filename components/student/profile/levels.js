// Level <select> options for the profile form. The wording itself lives in
// utils/profile/levels.js (single source, shared with onboarding).
import { LEVEL_INFO, LEVELS } from '@/utils/profile/levels'

export const LEVEL_OPTIONS = LEVELS.map((code) => {
  const info = LEVEL_INFO[code] || { name: code, desc: '' }
  const prefix = code === 'unknown' ? '' : `${code} · `
  return { value: code, label: `${prefix}${info.name}${info.desc ? ` — ${info.desc}` : ''}` }
})
