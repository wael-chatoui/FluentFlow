// Answer options for the student onboarding + (de)serialisation helpers.
// goals / interests are stored as plain text (≤ 1000 chars, see utils/api/validate.js)
// because the AI reads them as-is: "Travel, Work — I want to pass the DELF B2".
import {
  BookOpen,
  Briefcase,
  Clapperboard,
  CookingPot,
  Film,
  Flower2,
  Gamepad2,
  GraduationCap,
  Heart,
  House,
  Landmark,
  Laptop,
  Leaf,
  Luggage,
  MessagesSquare,
  Microscope,
  Music,
  Newspaper,
  Palette,
  Plane,
  Shirt,
  TrendingUp,
  Volleyball,
} from 'lucide-react'
import { LEVEL_INFO, LEVELS, levelShort } from '@/utils/profile/levels'

export const STEP_COUNT = 5
export const STEPS = { NAME: 0, LEVEL: 1, GOALS: 2, INTERESTS: 3, SUMMARY: 4 }

export const NAME_MAX = 120
export const PROFILE_TEXT_MAX = 1000 // LIMITS.profileText on the server

// Level wording is shared with the student profile (utils/profile/levels.js)
export const LEVEL_OPTIONS = LEVELS.map((code) => ({
  code,
  badge: code === 'unknown' ? '?' : code,
  title: LEVEL_INFO[code]?.name || code,
  desc: LEVEL_INFO[code]?.desc || '',
}))

export function levelLabel(code) {
  return code === 'unknown' ? LEVEL_INFO.unknown.name : levelShort(code)
}

// icon: lucide-react component shown next to the label (decorative)
export const GOAL_OPTIONS = [
  { id: 'travel', icon: Plane, label: 'Travel' },
  { id: 'work', icon: Briefcase, label: 'Work' },
  { id: 'exams', icon: GraduationCap, label: 'Exams (DELF/DALF)' },
  { id: 'moving', icon: House, label: 'Moving to France' },
  { id: 'family', icon: Heart, label: 'Family & friends' },
  { id: 'culture', icon: Clapperboard, label: 'Culture & fun' },
  { id: 'conversation', icon: MessagesSquare, label: 'Conversation confidence' },
]

export const INTEREST_OPTIONS = [
  { id: 'food', icon: CookingPot, label: 'Food & cooking' },
  { id: 'music', icon: Music, label: 'Music' },
  { id: 'film', icon: Film, label: 'Film & TV' },
  { id: 'sport', icon: Volleyball, label: 'Sport' },
  { id: 'books', icon: BookOpen, label: 'Books' },
  { id: 'tech', icon: Laptop, label: 'Tech' },
  { id: 'business', icon: TrendingUp, label: 'Business' },
  { id: 'art', icon: Palette, label: 'Art & design' },
  { id: 'nature', icon: Leaf, label: 'Nature' },
  { id: 'travel', icon: Luggage, label: 'Travel' },
  { id: 'games', icon: Gamepad2, label: 'Games' },
  { id: 'history', icon: Landmark, label: 'History' },
  { id: 'science', icon: Microscope, label: 'Science' },
  { id: 'fashion', icon: Shirt, label: 'Fashion' },
  { id: 'news', icon: Newspaper, label: 'News & politics' },
  { id: 'wellness', icon: Flower2, label: 'Wellness' },
]

const SEPARATOR = ' — '

/** Known option ids only, in option order, without duplicates. */
export function cleanIds(options, ids) {
  if (!Array.isArray(ids)) return []
  return options.filter((o) => ids.includes(o.id)).map((o) => o.id)
}

const labelsOf = (options, ids) =>
  options
    .filter((o) => ids.includes(o.id))
    .map((o) => o.label)
    .join(', ')

/**
 * Room left for the free text once the picked chips are written in front of it,
 * so the stored value never exceeds PROFILE_TEXT_MAX (nothing is ever cut).
 */
export function freeTextMax(options, ids) {
  const labels = labelsOf(options, ids)
  return PROFILE_TEXT_MAX - (labels ? labels.length + SEPARATOR.length : 0)
}

/** ['travel', 'work'] + 'I want to…' → 'Travel, Work — I want to…' */
export function serializeChoices(options, ids, text) {
  const labels = labelsOf(options, ids)
  const extra = (text || '').trim()
  return labels && extra ? `${labels}${SEPARATOR}${extra}` : labels || extra
}

/**
 * Best-effort reverse of serializeChoices (prefill from an existing profile).
 * Anything that isn't exactly "Label, Label — text" is kept as free text, in full:
 * a text over the limit is flagged by the step (see stepValidity), never truncated.
 */
export function parseChoices(options, value) {
  const str = typeof value === 'string' ? value.trim() : ''
  if (!str) return { ids: [], text: '' }
  const at = str.indexOf(SEPARATOR)
  const head = at >= 0 ? str.slice(0, at) : str
  const byLabel = new Map(options.map((o) => [o.label.toLowerCase(), o.id]))
  const ids = head.split(', ').map((part) => byLabel.get(part.trim().toLowerCase()))
  if (ids.some((id) => !id)) return { ids: [], text: str }
  const text = at >= 0 ? str.slice(at + SEPARATOR.length).trim() : ''
  return { ids: cleanIds(options, ids), text }
}

/** How many characters of free text are over the limit (0 = fits). */
export function freeTextOverflow(options, ids, text) {
  return Math.max(0, (text || '').trim().length - freeTextMax(options, ids))
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

/** Which steps are complete (index = step). Interests are optional but must fit. */
export function stepValidity(answers) {
  const name = answers.fullName.trim()
  const nameOk = name.length > 0 && name.length <= NAME_MAX
  const levelOk = LEVELS.includes(answers.level)
  const goalsOk =
    (answers.goals.length > 0 || answers.goalsText.trim().length > 0) &&
    freeTextOverflow(GOAL_OPTIONS, answers.goals, answers.goalsText) === 0
  const interestsOk = freeTextOverflow(INTEREST_OPTIONS, answers.interests, answers.interestsText) === 0
  return [nameOk, levelOk, goalsOk, interestsOk, nameOk && levelOk && goalsOk && interestsOk]
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
