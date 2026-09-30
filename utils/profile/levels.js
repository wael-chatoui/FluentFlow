// Student-facing level wording (English), shared by onboarding, the student profile
// and anything else that shows a level. Codes come from utils/lesson/schema.js LEVELS.
import { LEVELS } from '@/utils/lesson/schema'

export const LEVEL_INFO = {
  A1: { name: 'Complete beginner', desc: 'I know a few words' },
  A2: { name: 'Elementary', desc: 'I can handle simple everyday situations' },
  B1: { name: 'Intermediate', desc: 'I can get by and talk about familiar topics' },
  B2: { name: 'Upper intermediate', desc: 'I can discuss most topics, with some effort' },
  C1: { name: 'Advanced', desc: "I'm fluent and working on nuance and style" },
  C2: { name: 'Mastery', desc: 'Near-native — I want to stay sharp' },
  unknown: { name: 'Not sure', desc: 'Wael will help you find out' },
}

/** Short label for a pill, e.g. "B1 · Intermediate" ('' if no level). */
export function levelShort(code) {
  if (!code || !LEVELS.includes(code)) return ''
  if (code === 'unknown') return 'Level not set yet'
  return `${code} · ${LEVEL_INFO[code].name}`
}

export { LEVELS }
