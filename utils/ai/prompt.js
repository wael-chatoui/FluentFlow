// Prompt for turning a class into a lesson recap + exercises. Two modes:
// - 'transcript': Preply transcript + Canva notes of a class that just happened;
// - 'import': an existing lesson document written by the tutor (PDF / Google Doc),
//   restructured faithfully (no invented class events or mistakes).
// Encodes Wael's teaching rules (agent.md): conversation-first, micro-learning
// (one grammar point), "Now I can…" goals, student-only content.
import { SAMPLE_LESSON } from '@/utils/lesson/sample'
import { EXERCISE_TYPES } from '@/utils/lesson/schema'

const MAX_TRANSCRIPT = 120_000
const MAX_CANVA = 40_000
const MAX_DOCUMENT = 150_000

/** Bounds of the teacher's generation options { count, types, instructions }. */
export const GENERATION_LIMITS = { minCount: 4, maxCount: 20, defaultCount: 10, maxInstructions: 1000 }

export const DEFAULT_GENERATION_OPTIONS = Object.freeze({
  count: GENERATION_LIMITS.defaultCount,
  types: Object.freeze([...EXERCISE_TYPES]),
  instructions: '',
})

/**
 * Lenient normalization of generation options (already validated, or read from the
 * database): clamps count, keeps known types (all when none), trims instructions.
 * @returns {{ count: number, types: string[], instructions: string } | null} null when `raw` is not an object
 */
export function resolveGenerationOptions(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const { minCount, maxCount, defaultCount, maxInstructions } = GENERATION_LIMITS
  const n = Number(raw.count)
  const count = Number.isInteger(n) ? Math.min(maxCount, Math.max(minCount, n)) : defaultCount
  const wanted = Array.isArray(raw.types) ? raw.types : []
  const types = EXERCISE_TYPES.filter((t) => wanted.includes(t))
  const instructions = typeof raw.instructions === 'string' ? raw.instructions.trim().slice(0, maxInstructions) : ''
  return { count, types: types.length ? types : [...EXERCISE_TYPES], instructions }
}

/** Keeps the start and the end of a long text (the middle is usually the least useful). */
export function truncateMiddle(value, max) {
  const s = String(value || '').trim()
  if (s.length <= max) return s
  const half = Math.floor((max - 40) / 2)
  return `${s.slice(0, half)}\n\n[… middle part removed for length …]\n\n${s.slice(-half)}`
}

const ENGLISH_LEVELS = ['A1', 'A2']

/** A1–A2 (and unknown) → simple English explanations; B1+ → French. */
export function explanationLanguage(level) {
  return level && level !== 'unknown' && !ENGLISH_LEVELS.includes(level) ? 'French' : 'simple English'
}

// Small version of SAMPLE_LESSON: one item per list, one exercise per allowed type
function formatExample(types = EXERCISE_TYPES) {
  const s = SAMPLE_LESSON
  const firstOfType = (type) => s.exercises.find((e) => e.type === type)
  return JSON.stringify({
    title: s.title,
    summary: s.summary,
    topics: s.topics.slice(0, 2),
    vocabulary: s.vocabulary.slice(0, 2),
    corrections: s.corrections.slice(0, 1),
    grammar: s.grammar.slice(0, 1),
    expressions: s.expressions.slice(0, 1),
    homework: s.homework.slice(0, 2),
    can_do: s.can_do.slice(0, 1),
    exercises: EXERCISE_TYPES.filter((t) => types.includes(t)).map(firstOfType),
  })
}

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

const TUTOR = 'You are the assistant of Wael, a native French tutor on Preply. His classes are conversation-first, relaxed and without judgement.'

const INTRO = {
  transcript: `${TUTOR} After each class you turn the class transcript and the teacher's Canva notes into a lesson recap for the STUDENT, plus practice exercises.`,
  import: `${TUTOR} Wael already wrote this lesson as a document (vocabulary lists, grammar rules, exercises, homework…). You turn that existing document into a lesson recap for the STUDENT, plus practice exercises.`,
}

// Comments of the JSON shape that differ between modes
const SHAPE_NOTES = {
  transcript: {
    summary: 'recap of the conversation, 2–3 short paragraphs separated by \\n\\n',
    topics: '2–5 conversation topics',
    vocabulary: '6–15 words seen in class; example = natural French sentence',
    corrections: "the student's real mistakes",
    grammar: 'EXACTLY ONE item',
    expressions: '2–6 practical expressions',
  },
  import: {
    summary: 'what the lesson covered, addressed to the student, 2–3 short paragraphs separated by \\n\\n',
    topics: '2–5 main topics of the document',
    vocabulary: '6–15 words from the document (all of them if it has fewer); example = natural French sentence',
    corrections: 'mistakes the document shows corrected, or [] if there are none',
    grammar: 'ONE item: the main grammar point of the document ([] if it has none)',
    expressions: '0–6 practical expressions from the document',
  },
}

function jsonShape(notes, exercisesNote) {
  return `Reply with ONE JSON object and nothing else (no markdown fences, no comments). Exact shape:
{
  "title": string,            // short lesson title, max 80 characters
  "summary": string,          // ${notes.summary}
  "topics": string[],         // ${notes.topics}
  "vocabulary": [{ "fr": string, "en": string, "example": string }],   // ${notes.vocabulary}
  "corrections": [{ "wrong": string, "right": string, "explanation": string }],   // ${notes.corrections}
  "grammar": [{ "title": string, "explanation": string, "examples": string[] }],   // ${notes.grammar}
  "expressions": [{ "fr": string, "en": string, "example": string }],  // ${notes.expressions}
  "homework": [{ "task": string, "link": string }],   // 1–3 tasks; link = https URL or ""
  "can_do": string[],         // 2–4 items, each starting with "Now I can"
  "exercises": [ ... ]        // ${exercisesNote}, see below
}`
}

const RULE_TU = '- Talk directly to the student (second person). Whenever you write French to the student, use "tu", never "vous".'
const RULE_NEVER =
  '- NEVER include: dictation texts, instructions for future oral exercises or role plays, notes or instructions meant for the tutor, lesson plans, or logistics (scheduling, payments, technical problems).'
const RULE_PRIVACY = '- Do not write personal data such as phone numbers, addresses or emails.'
const RULE_LANGUAGE =
  '- Explanations (summary, correction explanations, grammar explanation, exercise prompts and explanations, homework) are written in the language given in the student profile: simple English for A1–A2, French for B1 and above. French words, examples and sentences always stay in French. "en" fields are English translations.'
const HOMEWORK_LINKS = 'For video links, only use a YouTube search URL like https://www.youtube.com/results?search_query=... ; otherwise link = "".'
const RULE_FORMAT = '- In any text field you may highlight a key word with **double asterisks**. Use \\n for line breaks. No HTML, no other markdown.'

const RECAP_RULES = {
  transcript: [
    '- In the transcript, Wael is the tutor; the other speaker is the student. The transcript comes from automatic speech recognition: ignore obvious recognition errors, they are not the student\'s mistakes.',
    RULE_TU,
    '- The summary recaps what you talked about (real topics and details from the conversation) and ends with one encouraging sentence about progress and what to work on next.',
    '- Vocabulary, expressions, corrections and grammar must come from THIS class only: the transcript and the Canva notes. Never invent content that was not covered.',
    '- corrections: take the student\'s actual mistakes from the transcript (grammar, gender, agreement, word choice, anglicisms). "wrong" quotes what the student said (lightly trimmed), "right" is the natural correct French. Skip hesitations and self-corrections. Up to 12 items, most useful first.',
    "- grammar: ONE grammar point only (micro-learning): the one most related to the student's mistakes or the teacher's notes. Clear rule + 3–5 short examples.",
    '- The Canva notes are raw notes typed during class: fix every typo, spelling, accent and agreement error (e.g. "Tangier" → "Tanger", "allée" → "aller") so the recap is flawless.',
    RULE_NEVER,
    RULE_PRIVACY,
    RULE_LANGUAGE,
    `- Homework: short and concrete (e.g. write 5 sentences using the grammar point). ${HOMEWORK_LINKS}`,
    RULE_FORMAT,
  ],
  import: [
    '- The document is an existing lesson written by Wael, the tutor (vocabulary lists, grammar rules, examples, exercises, homework…). It was extracted from a PDF or a Google Doc: ignore layout artefacts (broken lines, page numbers, repeated headers, table columns glued together, decorative emojis).',
    RULE_TU,
    "- Restructure the document faithfully into the JSON shape: keep the tutor's vocabulary, translations, explanations, examples and corrections. Never invent content that the document does not cover.",
    '- There is no class transcript: do NOT invent class events, conversations, anecdotes or student mistakes. Never write "we talked about…" or "you said…" unless the document says so.',
    '- The summary explains what the lesson covered (its topics, vocabulary and grammar), addressed to the student, and ends with one encouraging sentence about what to practise next.',
    '- vocabulary and expressions: take them from the document. When a translation or an example sentence is missing, add a simple, correct one.',
    '- corrections: ONLY mistakes that the document itself shows corrected (e.g. "wrong → right"). If the document contains none, "corrections" is an empty array.',
    "- grammar: ONE grammar point only (micro-learning): the main one of the document, with a clear rule and 3–5 short examples (keep the document's examples when there are some). If the document has no grammar at all, \"grammar\" is an empty array.",
    '- Fix every typo, spelling, accent and agreement error in the French of the document so the recap is flawless.',
    RULE_NEVER,
    RULE_PRIVACY,
    RULE_LANGUAGE,
    `- Homework: keep the homework of the document when there is some (as short, concrete tasks); otherwise give 1–2 short tasks to review this lesson. ${HOMEWORK_LINKS}`,
    RULE_FORMAT,
  ],
}

const EXERCISE_SOURCE = {
  transcript:
    "- Build them ONLY from the vocabulary, the corrected mistakes, the expressions and the grammar point of this lesson. Target the student's real mistakes.",
  import:
    '- Build them ONLY from the content of the document (its vocabulary, expressions, grammar rules, examples and exercises). Never test anything the document does not cover. Exercises already in the document may be reused, converted to the shapes below.',
}

const EXERCISE_SHAPES = {
  mcq: `  { "type": "mcq", "prompt": string, "sentence": string, "choices": [string, string, string], "answer": 0|1|2, "explanation": string }
    → exactly 3 different choices; "answer" is the index of the right choice; "sentence" may contain one ___ gap, or be the question itself.`,
  fill_blank: `  { "type": "fill_blank", "prompt": string, "sentence": string, "answers": string[], "hint": string, "explanation": string }
    → "sentence" contains EXACTLY ONE ___ ; "answers" lists every accepted spelling (e.g. masculine and feminine forms), 1–3 words each; "hint" helps without giving the answer.`,
  match: `  { "type": "match", "prompt": string, "pairs": [{ "fr": string, "en": string }], "explanation": string }
    → 3–6 pairs of short items, all "fr" different and all "en" different.`,
}

const DEFAULT_MIX = '10–14 exercises, about 60% "mcq", 25% "fill_blank", 15% "match"'

const quoteTypes = (types) => types.map((t) => `"${t}"`).join(', ')

function exerciseMix(options) {
  if (!options) return DEFAULT_MIX
  const { count, types } = options
  if (types.length === 1) return `EXACTLY ${count} exercises, all of type ${quoteTypes(types)}`
  return `EXACTLY ${count} exercises, only of types ${quoteTypes(types)}, spread across these types, each one used at least once`
}

function exerciseRules(mode, options) {
  const types = options ? options.types : EXERCISE_TYPES
  const rules = [`Exercise rules (Duolingo-style practice, ${exerciseMix(options)}):`, EXERCISE_SOURCE[mode]]
  if (options) {
    rules.push(`- Return EXACTLY ${options.count} exercises. Never use another exercise type than ${quoteTypes(types)}.`)
  }
  rules.push('- Sentences must be natural, correct French. Exactly one right answer, never ambiguous.')
  if (types.includes('mcq')) {
    rules.push(
      '- Wrong options must be plausible: typical learner errors (wrong auxiliary, missing agreement, wrong gender, false friends, anglicisms), not absurd.'
    )
  }
  rules.push('- Exercise shapes (do not add an "id"):')
  rules.push(...EXERCISE_TYPES.filter((t) => types.includes(t)).map((t) => EXERCISE_SHAPES[t]))
  return rules.join('\n')
}

const EXAMPLE_INTRO = {
  transcript: 'Format reference (shortened example of a valid answer, written for an A2 student so its explanations are in English):',
  import:
    'Format reference (shortened example of a valid answer, written for an A2 student so its explanations are in English). It shows the FORMAT only: its content comes from a class conversation, yours must come from the document.',
}

/**
 * System prompt for a mode. Without options, transcript mode keeps its historical
 * wording (10–14 exercises, mixed types).
 * @param {'transcript'|'import'} mode
 * @param {{ count: number, types: string[] } | null} options  resolved options
 */
export function buildSystemPrompt(mode = 'transcript', options = null) {
  const m = mode === 'import' ? 'import' : 'transcript'
  const exercisesNote = options ? `EXACTLY ${options.count} exercises` : '10–14 exercises'
  return `${INTRO[m]}

${jsonShape(SHAPE_NOTES[m], exercisesNote)}

Recap rules:
${RECAP_RULES[m].join('\n')}

${exerciseRules(m, options)}

${EXAMPLE_INTRO[m]}
${formatExample(options ? options.types : EXERCISE_TYPES)}`
}

// ---------------------------------------------------------------------------
// User message
// ---------------------------------------------------------------------------

function line(label, value) {
  const s = String(value || '').trim()
  return `${label}: ${s || '(not provided)'}`
}

const PREVIOUS_HEADER = {
  transcript: 'PREVIOUS LESSONS (for continuity — avoid repeating this vocabulary unless this class reviewed it):',
  import: 'PREVIOUS LESSONS (context only — still keep all the vocabulary of this document):',
}

function previousLessonsBlock(previousLessons, mode = 'transcript') {
  if (!previousLessons?.length) return 'PREVIOUS LESSONS: none (this is the first recap for this student).'
  const items = previousLessons.map((l) => {
    const words = (Array.isArray(l.vocabulary) ? l.vocabulary : [])
      .map((v) => v?.fr)
      .filter(Boolean)
      .slice(0, 15)
      .join(', ')
    return `- ${l.lesson_date || ''} — ${l.title || 'Untitled'}${words ? ` (vocabulary: ${words})` : ''}`
  })
  return `${PREVIOUS_HEADER[mode]}\n${items.join('\n')}`
}

function studentBlock(profile, notes) {
  const p = profile || {}
  const level = p.level || 'unknown'
  return [
    'STUDENT',
    line('Name', p.full_name),
    `Level: ${level} → write explanations in ${explanationLanguage(level)}`,
    line('Goals', p.goals),
    line('Interests', p.interests),
    '',
    `TEACHER'S PRIVATE NOTES (context only, never quote them): ${String(notes || '').trim() || '(none)'}`,
  ]
}

// Exercise reminder + the teacher's free-text instructions (options mode only)
function optionsBlock(options) {
  if (!options) return []
  const kind = options.types.length === 1 ? 'type' : 'types'
  const block = ['', `EXERCISES: exactly ${options.count}, only of ${kind} ${quoteTypes(options.types)}.`]
  if (options.instructions) {
    block.push(
      `Teacher's extra instructions: ${options.instructions}`,
      '(Follow them as long as they do not break the JSON format and the rules above.)'
    )
  }
  return block
}

/**
 * @param {{ mode?: 'transcript'|'import', profile?: object, notes?: string,
 *           transcript?: string, canva?: string, sourceText?: string, sourceName?: string,
 *           lessonDate?: string, previousLessons?: object[], options?: object|null }} input
 *   options = { count, types, instructions } (validated or stored); import mode always
 *   uses options (defaults when missing), transcript mode only when provided.
 * @returns {{ system: string, user: string }}
 */
export function buildLessonPrompt({ mode, profile, notes, transcript, canva, sourceText, sourceName, lessonDate, previousLessons, options }) {
  const isImport = mode === 'import'
  const resolved = resolveGenerationOptions(options) || (isImport ? resolveGenerationOptions(DEFAULT_GENERATION_OPTIONS) : null)

  if (isImport) {
    const user = [
      ...studentBlock(profile, notes),
      '',
      line('LESSON DATE', lessonDate),
      '',
      previousLessonsBlock(previousLessons, 'import'),
      '',
      line('DOCUMENT NAME', sourceName),
      '===== DOCUMENT START =====',
      truncateMiddle(sourceText, MAX_DOCUMENT) || '(empty document)',
      '===== DOCUMENT END =====',
      ...optionsBlock(resolved),
      '',
      'Turn this document into the lesson recap and the exercises now, as the JSON object described in the instructions.',
    ].join('\n')
    return { system: buildSystemPrompt('import', resolved), user }
  }

  const transcriptText = truncateMiddle(transcript, MAX_TRANSCRIPT)
  const canvaText = truncateMiddle(canva, MAX_CANVA)

  const user = [
    ...studentBlock(profile, notes),
    '',
    line('LESSON DATE', lessonDate),
    '',
    previousLessonsBlock(previousLessons, 'transcript'),
    '',
    '===== TRANSCRIPT START =====',
    transcriptText || '(no transcript — rely on the Canva notes)',
    '===== TRANSCRIPT END =====',
    '',
    '===== CANVA NOTES START =====',
    canvaText || '(no Canva notes — rely on the transcript)',
    '===== CANVA NOTES END =====',
    ...optionsBlock(resolved),
    '',
    'Write the lesson recap and the exercises now, as the JSON object described in the instructions.',
  ].join('\n')

  return { system: buildSystemPrompt('transcript', resolved), user }
}
