// Friendly labels for utils/lesson/schema.js LEVELS (same wording as /onboarding).
import { LEVELS } from '@/utils/lesson/schema'

export const LEVEL_INFO = {
  A1: { name: 'Complete beginner', desc: 'I know a few words' },
  A2: { name: 'Elementary', desc: 'Simple everyday situations' },
  B1: { name: 'Intermediate', desc: 'I can get by in most situations' },
  B2: { name: 'Upper intermediate', desc: 'I can discuss many topics' },
  C1: { name: 'Advanced', desc: 'Fluent, working on nuance' },
  C2: { name: 'Mastery', desc: 'Near-native' },
  unknown: { name: "I'm not sure", desc: 'Wael will help you find out' },
}

export const LEVEL_OPTIONS = LEVELS.map((code) => {
  const info = LEVEL_INFO[code] || { name: code, desc: '' }
  const prefix = code === 'unknown' ? '' : `${code} · `
  return { value: code, label: `${prefix}${info.name}${info.desc ? ` — ${info.desc}` : ''}` }
})

/** Short label for a pill, e.g. "B1 · Intermediate" ('' if no level). */
export function levelShort(code) {
  if (!code || !LEVELS.includes(code)) return ''
  if (code === 'unknown') return 'Level not set yet'
  return `${code} · ${LEVEL_INFO[code]?.name || ''}`
}
