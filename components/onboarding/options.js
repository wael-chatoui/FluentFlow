// Answer options for the student onboarding + (de)serialisation helpers.
// goals / interests are stored as plain text (≤ 1000 chars, see utils/api/validate.js)
// because the AI reads them as-is: "Travel, Work — I want to pass the DELF B2".
import { LEVELS } from '@/utils/lesson/schema'

export const STEP_COUNT = 5
export const STEPS = { NAME: 0, LEVEL: 1, GOALS: 2, INTERESTS: 3, SUMMARY: 4 }

export const NAME_MAX = 120
export const PROFILE_TEXT_MAX = 1000
// Free text leaves room for the chip labels in front of it
export const FREE_TEXT_MAX = 700

const LEVEL_INFO = {
  A1: { title: 'Complete beginner', desc: 'I know a few words' },
  A2: { title: 'Elementary', desc: 'I can handle simple everyday situations' },
  B1: { title: 'Intermediate', desc: 'I can get by and talk about familiar topics' },
  B2: { title: 'Upper intermediate', desc: 'I can discuss most topics, with some effort' },
  C1: { title: 'Advanced', desc: "I'm fluent and working on nuance and style" },
  C2: { title: 'Mastery', desc: 'Near-native — I want to stay sharp' },
  unknown: { title: 'Not sure', desc: 'Wael will figure it out' },
}

export const LEVEL_OPTIONS = LEVELS.map((code) => ({
  code,
  badge: code === 'unknown' ? '?' : code,
  ...(LEVEL_INFO[code] || { title: code, desc: '' }),
}))

export function levelLabel(code) {
  const option = LEVEL_OPTIONS.find((o) => o.code === code)
  if (!option) return ''
  return code === 'unknown' ? 'Not sure yet' : `${code} · ${option.title}`
}

export const GOAL_OPTIONS = [
  { id: 'travel', emoji: '✈️', label: 'Travel' },
  { id: 'work', emoji: '💼', label: 'Work' },
  { id: 'exams', emoji: '🎓', label: 'Exams (DELF/DALF)' },
  { id: 'moving', emoji: '🏡', label: 'Moving to France' },
  { id: 'family', emoji: '❤️', label: 'Family & friends' },
  { id: 'culture', emoji: '🎬', label: 'Culture & fun' },
  { id: 'conversation', emoji: '🗣️', label: 'Conversation confidence' },
]

export const INTEREST_OPTIONS = [
  { id: 'food', emoji: '🍳', label: 'Food & cooking' },
  { id: 'music', emoji: '🎵', label: 'Music' },
  { id: 'film', emoji: '🎬', label: 'Film & TV' },
  { id: 'sport', emoji: '⚽', label: 'Sport' },
  { id: 'books', emoji: '📚', label: 'Books' },
  { id: 'tech', emoji: '💻', label: 'Tech' },
  { id: 'business', emoji: '📈', label: 'Business' },
  { id: 'art', emoji: '🎨', label: 'Art & design' },
  { id: 'nature', emoji: '🌿', label: 'Nature' },
  { id: 'travel', emoji: '🧳', label: 'Travel' },
  { id: 'games', emoji: '🎮', label: 'Games' },
  { id: 'history', emoji: '🏛️', label: 'History' },
  { id: 'science', emoji: '🔬', label: 'Science' },
  { id: 'fashion', emoji: '👗', label: 'Fashion' },
  { id: 'news', emoji: '📰', label: 'News & politics' },
  { id: 'wellness', emoji: '🧘', label: 'Wellness' },
]

const SEPARATOR = ' — '

/** Known option ids only, in option order, without duplicates. */
export function cleanIds(options, ids) {
  if (!Array.isArray(ids)) return []
  return options.filter((o) => ids.includes(o.id)).map((o) => o.id)
}

/** ['travel', 'work'] + 'I want to…' → 'Travel, Work — I want to…' */
export function serializeChoices(options, ids, text) {
  const labels = options.filter((o) => ids.includes(o.id)).map((o) => o.label).join(', ')
  const extra = (text || '').trim()
  const joined = labels && extra ? `${labels}${SEPARATOR}${extra}` : labels || extra
  return joined.slice(0, PROFILE_TEXT_MAX)
}

/**
 * Best-effort reverse of serializeChoices (prefill from an existing profile).
 * Anything that isn't exactly "Label, Label — text" is kept as free text.
 */
export function parseChoices(options, value) {
  const str = typeof value === 'string' ? value.trim() : ''
  if (!str) return { ids: [], text: '' }
  const at = str.indexOf(SEPARATOR)
  const head = at >= 0 ? str.slice(0, at) : str
  const byLabel = new Map(options.map((o) => [o.label.toLowerCase(), o.id]))
  const ids = head.split(', ').map((part) => byLabel.get(part.trim().toLowerCase()))
  if (ids.some((id) => !id)) return { ids: [], text: str.slice(0, FREE_TEXT_MAX) }
  const text = at >= 0 ? str.slice(at + SEPARATOR.length).trim() : ''
  return { ids: cleanIds(options, ids), text: text.slice(0, FREE_TEXT_MAX) }
}

export function firstNameOf(fullName) {
  return (fullName || '').trim().split(/\s+/)[0] || ''
}

export const EMPTY_ANSWERS = {
  fullName: '',
  level: '',
  goals: [],
  goalsText: '',
  interests: [],
  interestsText: '',
}

/** Which steps are complete (index = step). Interests are optional. */
export function stepValidity(answers) {
  const name = answers.fullName.trim()
  const nameOk = name.length > 0 && name.length <= NAME_MAX
  const levelOk = LEVELS.includes(answers.level)
  const goalsOk = answers.goals.length > 0 || answers.goalsText.trim().length > 0
  return [nameOk, levelOk, goalsOk, true, nameOk && levelOk && goalsOk]
}

export function hasInterests(answers) {
  return answers.interests.length > 0 || answers.interestsText.trim().length > 0
}

/** Body for POST /api/onboarding/complete */
export function toPayload(answers) {
  return {
    fullName: answers.fullName.trim().slice(0, NAME_MAX),
    level: answers.level,
    goals: serializeChoices(GOAL_OPTIONS, answers.goals, answers.goalsText),
    interests: serializeChoices(INTEREST_OPTIONS, answers.interests, answers.interestsText),
  }
}
