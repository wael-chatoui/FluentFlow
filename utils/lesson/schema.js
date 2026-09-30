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
//   homework:    [{ task, link }],                      // link: https YouTube search/video URL or ''
//   can_do: string[],                                  // "Now I can …"
// }
//
// Exercises (lessons.exercises), each with a stable string id:
//   { id, type: 'mcq',        prompt, sentence /* at most one ___ */, choices: [3 strings], answer: 0|1|2, explanation }
//   { id, type: 'fill_blank', prompt, sentence /* contains exactly one ___ */, answers: string[], hint, explanation }
//   { id, type: 'match',      prompt, pairs: [{ fr, en }] /* 3–6 pairs */, explanation }
// choices, answers and pairs are plain text (no **): a highlighted choice would give
// the answer away. prompt, sentence, hint and explanation may contain **word**.
//
// Tutor lesson plan (lesson_plans.content, teacher-only, French):
// {
//   title: string, trial: boolean, duration_min: number,
//   objectives: string[],                               // "Maintenant je peux …"
//   sections: [{ heading, minutes: number|null, body }], // body: multi-line text
//   homework_questions: string[],                        // the 4 questions, trial lessons only
// }

export const EXERCISE_TYPES = ['mcq', 'fill_blank', 'match']
export const BLANK = '___'
export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'unknown']

export const MAX_EXERCISES = 20

/** A lesson still 'generating' after this long is considered stuck (it can be relaunched). */
export const STALE_GENERATION_MS = 5 * 60 * 1000

/** True when `lesson` is 'generating' and was last touched more than STALE_GENERATION_MS ago. */
export function isStaleGeneration(lesson, now = Date.now()) {
  if (lesson?.status !== 'generating') return false
  const updated = Date.parse(lesson.updated_at || '')
  return Number.isFinite(updated) && now - updated > STALE_GENERATION_MS
}

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

// Answer-like text: plain, without the ** highlight markers
function plain(value, max) {
  return str(str(value, max * 2).replace(/\*\*/g, ''), max)
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

const YOUTUBE_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com']
const VIDEO_ID_RE = /^[\w-]{6,20}$/

/**
 * Homework links: only https YouTube searches or videos (the AI is told to use search
 * URLs; anything else could be hallucinated or injected). Returns '' otherwise.
 */
export function safeHomeworkUrl(value) {
  const s = safeHttpsUrl(value)
  if (!s) return ''
  const url = new URL(s)
  if (url.username || url.password || url.port) return ''
  if (url.hostname === 'youtu.be') return VIDEO_ID_RE.test(url.pathname.slice(1)) ? s : ''
  if (!YOUTUBE_HOSTS.includes(url.hostname)) return ''
  if (url.pathname === '/results') return url.searchParams.get('search_query')?.trim() ? s : ''
  if (url.pathname === '/watch') return VIDEO_ID_RE.test(url.searchParams.get('v') || '') ? s : ''
  const short = /^\/shorts\/([^/]+)$/.exec(url.pathname)
  return short && VIDEO_ID_RE.test(short[1]) ? s : ''
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
      .map((h) => ({ task: str(h?.task, 600), link: safeHomeworkUrl(h?.link) }))
      .filter((h) => h.task),
    can_do: strings(c.can_do, 8, 200),
  }
}

/** Fisher–Yates shuffle (returns a new array). */
export function shuffle(items) {
  const a = [...items]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// The blank may be written ___, ____, … or [blank]; always stored as ___
const withBlanks = (sentence) => sentence.replace(/\[blank\]|_{2,}/gi, BLANK)
const blankCount = (sentence) => sentence.split(BLANK).length - 1

// Returns the sentence with exactly one ___, or '' when it has none or several.
function oneBlank(sentence) {
  const s = withBlanks(sentence)
  return blankCount(s) === 1 ? s : ''
}

function normalizeMcq(e, { shuffleChoices = true } = {}) {
  const choices = list(e.choices, 3).map((c) => plain(c, 160))
  const answer = Number.isInteger(e.answer) ? e.answer : Number.parseInt(e.answer, 10)
  // One gap, or none when the sentence is the question itself
  const sentence = withBlanks(str(e.sentence, 400))
  if (!sentence || blankCount(sentence) > 1) return null
  if (choices.length !== 3 || choices.some((c) => !c)) return null
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
  const answers = list(Array.isArray(e.answers) ? e.answers : [e.answer], 5)
    .map((a) => plain(a, 80))
    .filter(Boolean)
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
    .map((p) => ({ fr: plain(p?.fr, 80), en: plain(p?.en, 80) }))
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

// Own keys only: 'constructor', '__proto__'… are not exercise types. hasOwnProperty
// rather than Object.hasOwn, which older iOS Safari (< 15.4) lacks (this file runs in the browser).
const isExerciseType = (type) => typeof type === 'string' && Object.prototype.hasOwnProperty.call(NORMALIZERS, type)

function normalizeOne(e, options) {
  if (!e || typeof e !== 'object' || !isExerciseType(e.type)) return null
  return NORMALIZERS[e.type](e, options)
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

/** JSON with sorted keys: two exercises are equal whatever the key order. */
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`)
      .join(',')}}`
  }
  return JSON.stringify(value ?? null)
}

// Stored exercise that an edited item leaves untouched (same id, same content), or null
function untouchedFinder(stored) {
  const byId = new Map()
  for (const e of Array.isArray(stored) ? stored : []) {
    if (e && typeof e === 'object' && typeof e.id === 'string' && !byId.has(e.id)) byId.set(e.id, e)
  }
  return (e) => {
    const before = e && typeof e === 'object' && typeof e.id === 'string' ? byId.get(e.id) : undefined
    return before && stableJson(before) === stableJson(e) ? before : null
  }
}

/**
 * 1-based positions of the items of an edited exercise list that are invalid. An item
 * identical to the stored exercise with its id (`stored`) is never invalid: exercises
 * saved under older, looser rules (e.g. an MCQ with two blanks) must not block saving
 * another exercise of the lesson.
 * @param {unknown[]} raw
 * @param {{ stored?: object[] }} [options]
 */
export function invalidEditedExercises(raw, { stored = [] } = {}) {
  const untouched = untouchedFinder(stored)
  return (Array.isArray(raw) ? raw : []).flatMap((e, i) =>
    untouched(e) || normalizeOne(e, { shuffleChoices: false }) ? [] : [i + 1]
  )
}

/**
 * Same validation as normalizeExercises, for an array edited by a human (teacher or
 * back office): keeps the order, never shuffles MCQ choices and keeps existing string ids.
 * Missing, invalid or duplicate ids get the next free `ex_N`, after the highest ex_N of
 * the array AND of `reservedIds` (pass the ids currently stored, so deleting the last
 * exercise and adding a new one never gives the new one an old exercise's id).
 * With `stored` (the exercises currently saved), an item left untouched is kept exactly
 * as stored, even if it predates the current rules.
 * @param {unknown[]} raw
 * @param {{ reservedIds?: string[], stored?: object[] }} [options]
 */
export function normalizeExercisesForEdit(raw, { reservedIds = [], stored = [] } = {}) {
  const untouched = untouchedFinder(stored)
  const items = list(raw, MAX_EXERCISES * 2)
    .map((e) => {
      const kept = untouched(e)
      if (kept) {
        const { id, ...exercise } = kept
        return { id: EDIT_ID_RE.test(id) ? id : '', exercise }
      }
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
  for (const id of [...used, ...reservedIds]) {
    const m = /^ex_(\d+)$/.exec(typeof id === 'string' ? id : '')
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

/** Homework-preference questions every trial lesson asks (agent.md). */
export const TRIAL_HOMEWORK_QUESTIONS = Object.freeze([
  'Est-ce que tu veux des devoirs ?',
  'À quelle fréquence ? (après chaque cours, le week-end…)',
  'Quelle charge de travail te convient ? (temps par semaine)',
  'Qu’est-ce que tu ne veux surtout PAS faire ? (par ex. pas de grammaire écrite, pas de longues vidéos)',
])

const DEFAULT_PLAN_MINUTES = 50

function wholeNumber(value, min, max) {
  const n = Math.round(Number(value))
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

/**
 * Normalizes a tutor lesson plan (AI output). `trial` is decided by the server (the
 * student has no lesson yet) and trial plans always carry the 4 homework questions.
 */
export function normalizePlanContent(raw, { trial = false } = {}) {
  const p = raw && typeof raw === 'object' ? raw : {}
  return {
    title: str(p.title, 120) || (trial ? 'Cours d’essai' : 'Prochain cours'),
    trial: Boolean(trial),
    duration_min: wholeNumber(p.duration_min, 15, 120) ?? DEFAULT_PLAN_MINUTES,
    objectives: strings(p.objectives, 6, 200),
    sections: list(p.sections, 10)
      .map((sec) => ({ heading: str(sec?.heading, 120), minutes: wholeNumber(sec?.minutes, 1, 60), body: text(sec?.body, 6000) }))
      .filter((sec) => sec.heading && sec.body),
    homework_questions: trial ? [...TRIAL_HOMEWORK_QUESTIONS] : [],
  }
}
