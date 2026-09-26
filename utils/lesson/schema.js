// Lesson + exercise data contract, shared by the AI generator, the API and the UI.
//
// Everything the AI returns goes through normalizeLessonContent / normalizeExercises
// before it is stored, so the UI can trust these shapes and never has to render
// raw HTML from the model (all fields are plain text).
//
// Lesson content (lessons.content):
// {
//   title: string,
//   summary: string,                                   // recap of the conversation, addressed to the student
//   topics: string[],
//   vocabulary:  [{ fr, en, example }],
//   corrections: [{ wrong, right, explanation }],
//   grammar:     [{ title, explanation, examples: string[] }],
//   expressions: [{ fr, en, example }],
//   homework:    [{ task, link }],                      // link: https URL or ''
//   can_do: string[],                                  // "Now I can …"
// }
//
// Exercises (lessons.exercises), each with a stable string id:
//   { id, type: 'mcq',        prompt, sentence, choices: [3 strings], answer: 0|1|2, explanation }
//   { id, type: 'fill_blank', prompt, sentence /* contains exactly one ___ */, answers: string[], hint, explanation }
//   { id, type: 'match',      prompt, pairs: [{ fr, en }] /* 3–6 pairs */, explanation }

export const EXERCISE_TYPES = ['mcq', 'fill_blank', 'match']
export const BLANK = '___'
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'unknown']

export const MAX_EXERCISES = 20

function str(value, max = 2000) {
  if (typeof value !== 'string') {
    if (typeof value === 'number') value = String(value)
    else return ''
  }
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

// Multi-line text (keeps paragraph breaks)
function text(value, max = 6000) {
  if (typeof value !== 'string') return ''
  return value
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, max)
}

function list(value, max = 30) {
  return Array.isArray(value) ? value.slice(0, max) : []
}

function strings(value, max = 30, len = 300) {
  return list(value, max).map((v) => str(v, len)).filter(Boolean)
}

export function safeHttpsUrl(value) {
  const s = str(value, 2000)
  if (!s) return ''
  try {
    const url = new URL(s)
    return url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

const DRIVE_HOSTS = ['drive.google.com', 'docs.google.com']

/** Returns the URL if it is an https Google Drive/Docs link, '' otherwise. */
export function safeDriveUrl(value) {
  const url = safeHttpsUrl(value)
  if (!url) return ''
  return DRIVE_HOSTS.includes(new URL(url).hostname) ? url : ''
}

export function normalizeLessonContent(raw) {
  const c = raw && typeof raw === 'object' ? raw : {}
  return {
    title: str(c.title, 120) || 'Lesson recap',
    summary: text(c.summary, 4000),
    topics: strings(c.topics, 12, 200),
    vocabulary: list(c.vocabulary, 40)
      .map((v) => ({ fr: str(v?.fr, 120), en: str(v?.en, 160), example: str(v?.example, 300) }))
      .filter((v) => v.fr && v.en),
    corrections: list(c.corrections, 30)
      .map((v) => ({ wrong: str(v?.wrong, 300), right: str(v?.right, 300), explanation: str(v?.explanation, 500) }))
      .filter((v) => v.wrong && v.right && v.wrong !== v.right),
    grammar: list(c.grammar, 6)
      .map((g) => ({ title: str(g?.title, 120), explanation: text(g?.explanation, 1500), examples: strings(g?.examples, 8, 300) }))
      .filter((g) => g.title && g.explanation),
    expressions: list(c.expressions, 20)
      .map((v) => ({ fr: str(v?.fr, 160), en: str(v?.en, 200), example: str(v?.example, 300) }))
      .filter((v) => v.fr && v.en),
    homework: list(c.homework, 8)
      .map((h) => ({ task: str(h?.task, 600), link: safeHttpsUrl(h?.link) }))
      .filter((h) => h.task),
    can_do: strings(c.can_do, 8, 200),
  }
}

function shuffle(items) {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// Accepts the blank written as ___, ____, …, or [blank]; returns '' if not exactly one blank.
function oneBlank(sentence) {
  const s = sentence.replace(/\[blank\]|_{2,}/gi, BLANK)
  return s.split(BLANK).length === 2 ? s : ''
}

function normalizeMcq(e, { shuffleChoices = true } = {}) {
  const choices = list(e.choices, 3).map((c) => str(c, 160))
  const answer = Number.isInteger(e.answer) ? e.answer : Number.parseInt(e.answer, 10)
  const sentence = str(e.sentence, 400)
  if (!sentence || choices.length !== 3 || choices.some((c) => !c)) return null
  if (new Set(choices.map((c) => c.toLowerCase())).size !== 3) return null
  if (!(answer >= 0 && answer <= 2)) return null
  // Shuffle so the right answer is not always in the same slot (AI output only)
  const correct = choices[answer]
  const ordered = shuffleChoices ? shuffle(choices) : choices
  return {
    type: 'mcq',
    prompt: str(e.prompt, 200) || 'Choose the right answer',
    sentence,
    choices: ordered,
    answer: ordered.indexOf(correct),
    explanation: str(e.explanation, 500),
  }
}

function normalizeFillBlank(e) {
  const sentence = oneBlank(str(e.sentence, 400))
  const answers = strings(Array.isArray(e.answers) ? e.answers : [e.answer], 5, 80)
  if (!sentence || answers.length === 0) return null
  return {
    type: 'fill_blank',
    prompt: str(e.prompt, 200) || 'Fill in the blank',
    sentence,
    answers,
    hint: str(e.hint, 160),
    explanation: str(e.explanation, 500),
  }
}

function normalizeMatch(e) {
  const pairs = list(e.pairs, 6)
    .map((p) => ({ fr: str(p?.fr, 80), en: str(p?.en, 80) }))
    .filter((p) => p.fr && p.en)
  const uniqueFr = new Set(pairs.map((p) => p.fr.toLowerCase())).size === pairs.length
  const uniqueEn = new Set(pairs.map((p) => p.en.toLowerCase())).size === pairs.length
  if (pairs.length < 3 || !uniqueFr || !uniqueEn) return null
  return {
    type: 'match',
    prompt: str(e.prompt, 200) || 'Match the pairs',
    pairs,
    explanation: str(e.explanation, 500),
  }
}

const NORMALIZERS = { mcq: normalizeMcq, fill_blank: normalizeFillBlank, match: normalizeMatch }

function normalizeOne(e, options) {
  return e && NORMALIZERS[e.type] ? NORMALIZERS[e.type](e, options) : null
}

/** Drops invalid exercises, fixes what can be fixed, assigns ids ex_1, ex_2, … */
export function normalizeExercises(raw) {
  return list(raw, MAX_EXERCISES * 2)
    .map((e) => normalizeOne(e))
    .filter(Boolean)
    .slice(0, MAX_EXERCISES)
    .map((e, i) => ({ id: `ex_${i + 1}`, ...e }))
}

const EDIT_ID_RE = /^[A-Za-z0-9_-]{1,40}$/

/**
 * Same validation as normalizeExercises, for an array edited by a human (back office):
 * keeps the order, never shuffles MCQ choices and keeps existing string ids.
 * Missing, invalid or duplicate ids get the next free `ex_N` (after the highest
 * existing ex_N, so an id is never reused for a different exercise).
 */
export function normalizeExercisesForEdit(raw) {
  const items = list(raw, MAX_EXERCISES * 2)
    .map((e) => {
      const normalized = normalizeOne(e, { shuffleChoices: false })
      if (!normalized) return null
      const id = typeof e.id === 'string' ? e.id.trim() : ''
      return { id: EDIT_ID_RE.test(id) ? id : '', exercise: normalized }
    })
    .filter(Boolean)
    .slice(0, MAX_EXERCISES)

  const used = new Set()
  for (const item of items) {
    if (item.id && !used.has(item.id)) used.add(item.id)
    else item.id = ''
  }
  let next = 1
  for (const id of used) {
    const m = /^ex_(\d+)$/.exec(id)
    if (m) next = Math.max(next, Number(m[1]) + 1)
  }
  return items.map(({ id, exercise }) => {
    if (id) return { id, ...exercise }
    while (used.has(`ex_${next}`)) next++
    const fresh = `ex_${next++}`
    used.add(fresh)
    return { id: fresh, ...exercise }
  })
}
