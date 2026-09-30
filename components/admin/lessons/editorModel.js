// Draft model of the admin lesson editor: builds an editable draft from the API
// lesson, diffs it against the original (only changed top-level fields are sent),
// and validates it client-side, mirroring utils/lesson/schema.js normalizers.
import { BLANK, safeDriveUrl, safeHomeworkUrl, stableJson } from '@/utils/lesson/schema'
import { exercisesResetProgress as savedExercisesResetProgress } from '@/utils/api/admin/lessonEdit'

export const LIMITS = {
  title: 120,
  contentTitle: 120,
  summary: 4000,
  topics: 12,
  topic: 200,
  vocabulary: 40,
  expressions: 20,
  corrections: 30,
  grammar: 6,
  grammarExamples: 8,
  homework: 8,
  canDo: 8,
  exercises: 20,
  mcqChoices: 3,
  fillAnswers: 5,
  pairsMin: 3,
  pairsMax: 6,
}

// Stable React keys for rows (stripped before diffing / sending)
let keySeq = 0
export const newKey = () => `k${++keySeq}`
const keyed = (item) => ({ ...item, _k: newKey() })

export function stripKeys(value) {
  if (Array.isArray(value)) return value.map(stripKeys)
  if (value && typeof value === 'object') {
    const out = {}
    Object.entries(value).forEach(([k, v]) => {
      if (k !== '_k') out[k] = stripKeys(v)
    })
    return out
  }
  return value
}

const arr = (v) => (Array.isArray(v) ? v : [])
const s = (v) => (typeof v === 'string' ? v : v == null ? '' : String(v))

function toContentDraft(raw) {
  const c = raw && typeof raw === 'object' ? raw : {}
  return {
    ...c,
    title: s(c.title),
    summary: s(c.summary),
    topics: arr(c.topics).map(s),
    vocabulary: arr(c.vocabulary).map((v) => keyed({ fr: s(v?.fr), en: s(v?.en), example: s(v?.example) })),
    expressions: arr(c.expressions).map((v) => keyed({ fr: s(v?.fr), en: s(v?.en), example: s(v?.example) })),
    corrections: arr(c.corrections).map((v) =>
      keyed({ wrong: s(v?.wrong), right: s(v?.right), explanation: s(v?.explanation) })
    ),
    grammar: arr(c.grammar).map((g) =>
      keyed({ title: s(g?.title), explanation: s(g?.explanation), examples: arr(g?.examples).map(s) })
    ),
    homework: arr(c.homework).map((h) => keyed({ task: s(h?.task), link: s(h?.link) })),
    can_do: arr(c.can_do).map(s),
  }
}

function toExerciseDraft(e) {
  const base = { ...e, _k: newKey(), prompt: s(e?.prompt), explanation: s(e?.explanation) }
  if (e?.type === 'mcq') {
    const choices = arr(e.choices).map(s)
    while (choices.length < 3) choices.push('')
    const answer = Number.isInteger(e.answer) ? e.answer : Number.parseInt(e.answer, 10)
    return { ...base, sentence: s(e.sentence), choices: choices.slice(0, 3), answer: answer >= 0 && answer <= 2 ? answer : 0 }
  }
  if (e?.type === 'fill_blank') {
    return { ...base, sentence: s(e.sentence), answers: arr(e.answers).map(s), hint: s(e.hint) }
  }
  if (e?.type === 'match') {
    return { ...base, pairs: arr(e.pairs).map((p) => ({ fr: s(p?.fr), en: s(p?.en) })) }
  }
  return base
}

/** Editable draft from GET/PATCH /api/admin/lessons/[id] `lesson`. */
export function toDraft(lesson) {
  return {
    title: s(lesson?.title),
    lessonDate: s(lesson?.lesson_date).slice(0, 10),
    status: s(lesson?.status),
    studentId: s(lesson?.student_id),
    hidden: Boolean(lesson?.hidden),
    driveUrl: s(lesson?.drive_url),
    content: toContentDraft(lesson?.content),
    exercises: arr(lesson?.exercises).map(toExerciseDraft),
  }
}

export const FIELD_LABELS = {
  title: 'Titre',
  lessonDate: 'Date',
  status: 'Statut',
  studentId: 'Élève',
  hidden: 'Visibilité',
  driveUrl: 'Lien Drive',
  content: 'Contenu',
  exercises: 'Exercices',
}

export const FIELDS = Object.keys(FIELD_LABELS)

const serialize = (v) => JSON.stringify(stripKeys(v))

/** Top-level fields whose value differs from the original draft. */
export function changedFields(draft, original) {
  if (!draft || !original) return []
  return FIELDS.filter((f) => serialize(draft[f]) !== serialize(original[f]))
}

/**
 * Draft to show after a save answered with `saved` (server draft): fields edited
 * while the request was in flight (draft ≠ `sent`) keep the local value, and so do
 * fields the server stored unchanged (their row keys stay, so no input loses focus).
 */
export function mergeAfterSave(current, sent, saved) {
  const next = { ...saved }
  FIELDS.forEach((f) => {
    const local = serialize(current[f])
    if (local !== serialize(sent[f]) || local === serialize(saved[f])) next[f] = current[f]
  })
  return next
}

/**
 * True when saving the draft exercises resets the student's progress on the lesson:
 * an exercise was added or edited. Removing or reordering keeps the results, which are
 * stored per exercise id. Same function as the server (normalized comparison), so an
 * exercise saved under older rules and left alone never counts as edited.
 */
export function exercisesResetProgress(draftExercises, originalExercises) {
  const next = stripKeys(arr(draftExercises))
  return next.some((e) => !e.id) || savedExercisesResetProgress(stripKeys(arr(originalExercises)), next)
}

/** PATCH body with only the changed fields (trimmed, keys stripped, new exercises without id). */
export function buildPatch(draft, fields) {
  const body = {}
  fields.forEach((f) => {
    if (f === 'content') body.content = stripKeys(draft.content)
    else if (f === 'exercises') {
      body.exercises = stripKeys(draft.exercises).map((e) => {
        if (e.id) return e
        const { id: _id, ...rest } = e
        return rest
      })
    } else if (f === 'title' || f === 'driveUrl') body[f] = draft[f].trim()
    else body[f] = draft[f]
  })
  return body
}

// ---------------------------------------------------------------------------
// Validation — returns { [path]: message }. Paths:
//   title, lessonDate, status, studentId, driveUrl,
//   content.<section>.<i>.<field>, exercises.<i>.<field>
// ---------------------------------------------------------------------------

const blank = (v) => !s(v).trim()
// Same comparison as the server (utils/lesson/schema.js): spaces collapsed, ** ignored
const collapse = (v) => s(v).replace(/\s+/g, ' ').trim()
const lower = (v) => collapse(s(v).replace(/\*\*/g, '')).toLowerCase()
// Choices, answers and pairs are stored without ** (utils/lesson/schema.js plain()):
// '**' alone is empty for the server
const empty = (v) => !lower(v)

/** Number of blanks once ____ / [blank] are normalized to ___ (like the server). */
export function countBlanks(sentence) {
  const normalized = s(sentence).replace(/\[blank\]|_{2,}/gi, BLANK)
  return normalized.split(BLANK).length - 1
}

function validateContent(c, errors) {
  if (c.title.length > LIMITS.contentTitle) errors['content.title'] = `${LIMITS.contentTitle} caractères maximum.`
  const words = (section) =>
    c[section].forEach((v, i) => {
      if (blank(v.fr)) errors[`content.${section}.${i}.fr`] = 'Le français est obligatoire.'
      if (blank(v.en)) errors[`content.${section}.${i}.en`] = "L'anglais est obligatoire."
    })
  words('vocabulary')
  words('expressions')
  c.corrections.forEach((v, i) => {
    if (blank(v.wrong)) errors[`content.corrections.${i}.wrong`] = 'La phrase fautive est obligatoire.'
    if (blank(v.right)) errors[`content.corrections.${i}.right`] = 'La correction est obligatoire.'
    else if (!blank(v.wrong) && collapse(v.wrong) === collapse(v.right)) {
      errors[`content.corrections.${i}.right`] = 'La correction doit être différente de la phrase fautive.'
    }
  })
  c.grammar.forEach((g, i) => {
    if (blank(g.title)) errors[`content.grammar.${i}.title`] = 'Le titre est obligatoire.'
    if (blank(g.explanation)) errors[`content.grammar.${i}.explanation`] = "L'explication est obligatoire."
    g.examples.forEach((ex, j) => {
      if (blank(ex)) errors[`content.grammar.${i}.examples.${j}`] = 'Exemple vide : remplis-le ou supprime-le.'
    })
  })
  c.homework.forEach((h, i) => {
    if (blank(h.task)) errors[`content.homework.${i}.task`] = 'La consigne est obligatoire.'
    if (!blank(h.link) && !safeHomeworkUrl(h.link)) {
      // Same rule as the server and the student view: other links are never shown
      errors[`content.homework.${i}.link`] =
        'Seuls les liens YouTube sont gardés (vidéo ou recherche, en https) : corrige ou efface ce lien.'
    }
  })
  c.can_do.forEach((item, i) => {
    if (blank(item)) errors[`content.can_do.${i}`] = 'Ligne vide : remplis-la ou supprime-la.'
  })
}

function validateExercise(e, i, errors) {
  const p = `exercises.${i}`
  if (e.type === 'mcq') {
    const n = countBlanks(e.sentence)
    if (blank(e.sentence)) errors[`${p}.sentence`] = 'La phrase est obligatoire.'
    else if (n > 1) errors[`${p}.sentence`] = `Au plus un ${BLANK} dans la phrase (actuellement ${n}).`
    const choices = arr(e.choices)
    if (choices.length !== 3 || choices.some(empty)) errors[`${p}.choices`] = 'Il faut 3 choix non vides.'
    else if (new Set(choices.map(lower)).size !== 3) errors[`${p}.choices`] = 'Les 3 choix doivent être différents.'
    if (!(e.answer >= 0 && e.answer <= 2)) errors[`${p}.answer`] = 'Coche la bonne réponse.'
  } else if (e.type === 'fill_blank') {
    const n = countBlanks(e.sentence)
    if (blank(e.sentence)) errors[`${p}.sentence`] = 'La phrase est obligatoire.'
    else if (n !== 1) errors[`${p}.sentence`] = `La phrase doit contenir exactement un ${BLANK} (actuellement ${n}).`
    // The server keeps the first 5 answers only: more would be dropped silently
    const answers = arr(e.answers)
    if (answers.length > LIMITS.fillAnswers) errors[`${p}.answers`] = `${LIMITS.fillAnswers} réponses maximum.`
    else if (answers.every(empty)) errors[`${p}.answers`] = 'Ajoute au moins une réponse acceptée.'
  } else if (e.type === 'match') {
    const pairs = arr(e.pairs)
    pairs.forEach((pair, j) => {
      if (empty(pair.fr) || empty(pair.en)) errors[`${p}.pairs.${j}`] = 'Remplis le français et l’anglais.'
    })
    if (pairs.length < LIMITS.pairsMin || pairs.length > LIMITS.pairsMax) {
      errors[`${p}.pairs`] = `Il faut entre ${LIMITS.pairsMin} et ${LIMITS.pairsMax} paires.`
    } else if (
      new Set(pairs.map((x) => lower(x.fr))).size !== pairs.length ||
      new Set(pairs.map((x) => lower(x.en))).size !== pairs.length
    ) {
      errors[`${p}.pairs`] = 'Chaque mot doit être unique (côté français et côté anglais).'
    }
  } else {
    errors[`${p}.type`] = "Type d'exercice inconnu."
  }
}

/**
 * Draft errors by path. `storedExercises`: the exercises as saved (API `lesson.exercises`).
 * One left exactly as stored is not checked: the server keeps it even if it predates the
 * current rules (e.g. an MCQ with two blanks), so it must not block the save.
 */
export function validateDraft(d, { storedExercises = [] } = {}) {
  const errors = {}
  if (!d) return errors
  if (blank(d.title)) errors.title = 'Le titre est obligatoire.'
  else if (d.title.trim().length > LIMITS.title) errors.title = `${LIMITS.title} caractères maximum.`
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.lessonDate)) errors.lessonDate = 'Date invalide.'
  if (!['published', 'failed'].includes(d.status)) errors.status = 'Choisis « Publiée » ou « Échec ».'
  if (!d.studentId) errors.studentId = 'Choisis un élève.'
  if (!blank(d.driveUrl) && !safeDriveUrl(d.driveUrl)) {
    errors.driveUrl = 'Lien Google Drive/Docs en https:// uniquement.'
  }
  validateContent(d.content, errors)
  if (d.exercises.length > LIMITS.exercises) errors.exercises = `${LIMITS.exercises} exercices maximum.`
  const untouched = untouchedMatcher(storedExercises)
  d.exercises.forEach((e, i) => {
    if (!untouched(e)) validateExercise(e, i, errors)
  })
  return errors
}

// Same test as the server (utils/lesson/schema.js): the item it receives (keys stripped)
// equals the stored exercise with its id
function untouchedMatcher(stored) {
  const byId = new Map()
  arr(stored).forEach((e) => {
    if (e && typeof e.id === 'string' && !byId.has(e.id)) byId.set(e.id, stableJson(e))
  })
  return (e) => typeof e.id === 'string' && byId.has(e.id) && byId.get(e.id) === stableJson(stripKeys(e))
}

/** Errors that belong to a top-level field ('content', 'exercises', 'title', …). */
export function errorsFor(errors, field) {
  return Object.keys(errors).filter((k) => k === field || k.startsWith(`${field}.`))
}

// Blank items for the "add" buttons
export const EMPTY = {
  word: () => keyed({ fr: '', en: '', example: '' }),
  correction: () => keyed({ wrong: '', right: '', explanation: '' }),
  grammar: () => keyed({ title: '', explanation: '', examples: [] }),
  homework: () => keyed({ task: '', link: '' }),
  mcq: () => keyed({ type: 'mcq', prompt: '', sentence: '', choices: ['', '', ''], answer: 0, explanation: '' }),
  fill_blank: () => keyed({ type: 'fill_blank', prompt: '', sentence: '', answers: [], hint: '', explanation: '' }),
  match: () =>
    keyed({
      type: 'match',
      prompt: '',
      pairs: [
        { fr: '', en: '' },
        { fr: '', en: '' },
        { fr: '', en: '' },
      ],
      explanation: '',
    }),
}

/** Immutable array helpers */
export const move = (list, from, to) => {
  if (to < 0 || to >= list.length) return list
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}
export const replaceAt = (list, index, value) => list.map((v, i) => (i === index ? value : v))
export const removeAt = (list, index) => list.filter((_, i) => i !== index)
