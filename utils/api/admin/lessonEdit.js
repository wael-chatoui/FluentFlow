// Strict checks for lesson edits made in the back office. The schema normalizers
// silently drop invalid items (right for AI output); for a human edit a dropped item
// is lost work, so the save is refused with the list of problems instead.
// Pure (no server-only import): the back-office editor uses exercisesResetProgress too.
import {
  invalidEditedExercises,
  isStaleGeneration,
  normalizeExercisesForEdit,
  normalizeLessonContent,
  stableJson,
} from '@/utils/lesson/schema'

const CONTENT_SECTIONS = {
  topics: 'Thèmes',
  vocabulary: 'Vocabulaire',
  expressions: 'Expressions',
  corrections: 'Corrections',
  grammar: 'Grammaire',
  homework: 'Devoirs',
  can_do: '« Je peux… »',
}

/** `error` of a lesson marked « Échec » by hand (none was recorded). */
export const MANUAL_FAILURE = 'Marquée en échec depuis le back office.'
/** Same, for a stuck generation (its start had cleared the error). */
export const STUCK_FAILURE = 'Génération interrompue (bloquée) : marquée en échec depuis le back office.'

const list = (value) => (Array.isArray(value) ? value : [])
const plural = (n, word) => `${word}${n > 1 ? 's' : ''}`

/**
 * 1-based positions of the exercises a save refuses (normalizeExercisesForEdit would drop
 * them). One left exactly as stored (`stored`, same id) is accepted even if it predates
 * the current rules (e.g. an MCQ with two blanks): it must not block saving the others.
 */
export function invalidExercisePositions(raw, { stored = [] } = {}) {
  return invalidEditedExercises(raw, { stored })
}

/**
 * French messages for the content items the normalizer would drop or alter: missing
 * required text, too many items, a refused homework link. Empty when all is kept.
 */
export function contentProblems(raw) {
  const content = raw && typeof raw === 'object' ? raw : {}
  const normalized = normalizeLessonContent(content)
  const problems = []
  for (const [key, label] of Object.entries(CONTENT_SECTIONS)) {
    const items = list(content[key])
    const dropped = items.flatMap((item, i) => (normalizeLessonContent({ [key]: [item] })[key].length ? [] : [i + 1]))
    if (dropped.length) {
      problems.push(`${label} : ${plural(dropped.length, 'élément')} n° ${dropped.join(', ')} ${plural(dropped.length, 'incomplet')}`)
    } else if (normalized[key].length < items.length) {
      problems.push(`${label} : ${normalized[key].length} éléments au maximum`)
    }
  }
  list(content.homework).forEach((h, i) => {
    const link = typeof h?.link === 'string' ? h.link.trim() : ''
    if (link && !normalizeLessonContent({ homework: [h] }).homework[0]?.link) {
      problems.push(`Devoirs n° ${i + 1} : lien refusé (seules les vidéos ou recherches YouTube en https sont acceptées)`)
    }
  })
  return problems
}

// An exercise as the current rules store it (legacy ____ blank, ** in an answer…
// rewritten), under its own id; one they reject is compared as is.
function comparable(exercise) {
  const [normalized] = normalizeExercisesForEdit([exercise])
  return stableJson(normalized ? { ...normalized, id: exercise?.id } : exercise)
}

/**
 * True when saving `next` instead of `stored` invalidates the student's results on the
 * lesson: an exercise was added or really changed. Both sides are compared normalized,
 * so an exercise saved under older rules does not count as edited, whether it is kept
 * as stored or rewritten by the normalizer. Removing or reordering exercises keeps the
 * results, which are recorded per exercise id. Shared by the API and the back-office
 * editor's warning, so both give the same answer.
 */
export function exercisesResetProgress(stored, next) {
  const before = new Map(list(stored).map((e) => [e?.id, comparable(e)]))
  return list(next).some((e) => before.get(e?.id) !== comparable(e))
}

/**
 * Why a PATCH (column names) cannot be applied to a lesson in 'generating', or null:
 * - 'generating': the generation runs and will overwrite the row; only `hidden` may change.
 * - 'stuck': a stuck generation (see isStaleGeneration) needs a `status` with any save.
 *   Stuck is decided from updated_at, which every update refreshes: a save leaving it
 *   'generating' would make it look like a new generation (read-only, not relaunchable)
 *   for 5 more minutes.
 */
export function generationBlock(lesson, patch, now = Date.now()) {
  if (lesson?.status !== 'generating') return null
  if (!isStaleGeneration(lesson, now)) return Object.keys(patch).every((k) => k === 'hidden') ? null : 'generating'
  return patch.status === undefined ? 'stuck' : null
}

/**
 * `error` to write with a status change, undefined when it stays as is. Published: none
 * (a published lesson with an error reads as a failed regeneration on the teacher
 * dashboard). Failed: the recorded reason, else a default one.
 */
export function errorForStatus(lesson, status) {
  if (status === undefined || status === lesson.status) return undefined
  if (status === 'published') return null
  return lesson.error || (lesson.status === 'generating' ? STUCK_FAILURE : MANUAL_FAILURE)
}
