// In-progress onboarding answers, kept in sessionStorage so a refresh doesn't
// lose them. Browser-only: call from effects / event handlers, never during render.
import { LEVELS } from '@/utils/profile/levels'
import {
  GOAL_OPTIONS,
  INTEREST_OPTIONS,
  NAME_MAX,
  PROFILE_TEXT_MAX,
  STEP_COUNT,
  cleanIds,
} from '@/components/onboarding/options'

const VERSION = 1
const keyFor = (userId) => `onboarding-draft:v${VERSION}:${userId}`

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '')

/** { answers, step } or null when missing / unreadable. */
export function loadDraft(userId) {
  if (!userId) return null
  try {
    const raw = window.sessionStorage.getItem(keyFor(userId))
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || typeof data !== 'object' || !data.answers) return null
    const a = data.answers
    const step = Number.isInteger(data.step) ? Math.min(Math.max(data.step, 0), STEP_COUNT - 1) : 0
    return {
      step,
      answers: {
        fullName: text(a.fullName, NAME_MAX),
        level: LEVELS.includes(a.level) ? a.level : '',
        goals: cleanIds(GOAL_OPTIONS, a.goals),
        goalsText: text(a.goalsText, PROFILE_TEXT_MAX),
        interests: cleanIds(INTEREST_OPTIONS, a.interests),
        interestsText: text(a.interestsText, PROFILE_TEXT_MAX),
      },
    }
  } catch {
    return null
  }
}

export function saveDraft(userId, answers, step) {
  if (!userId) return
  try {
    window.sessionStorage.setItem(keyFor(userId), JSON.stringify({ answers, step }))
  } catch {
    // Storage full / disabled (private mode): the flow still works without it
  }
}

export function clearDraft(userId) {
  if (!userId) return
  try {
    window.sessionStorage.removeItem(keyFor(userId))
  } catch {
    // ignore
  }
}
