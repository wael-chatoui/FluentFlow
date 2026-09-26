// Prompt for turning a class (Preply transcript + Canva notes) into a lesson
// recap + exercises. Encodes Wael's teaching rules (agent.md): conversation-first,
// micro-learning (one grammar point), "Now I can…" goals, student-only content.
import { SAMPLE_LESSON } from '@/utils/lesson/sample'

const MAX_TRANSCRIPT = 120_000
const MAX_CANVA = 40_000

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

// Small version of SAMPLE_LESSON: one item per list, one exercise per type
function formatExample() {
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
    exercises: [firstOfType('mcq'), firstOfType('fill_blank'), firstOfType('match')],
  })
}

const SYSTEM_PROMPT = `You are the assistant of Wael, a native French tutor on Preply. His classes are conversation-first, relaxed and without judgement. After each class you turn the class transcript and the teacher's Canva notes into a lesson recap for the STUDENT, plus practice exercises.

Reply with ONE JSON object and nothing else (no markdown fences, no comments). Exact shape:
{
  "title": string,            // short lesson title, max 80 characters
  "summary": string,          // recap of the conversation, 2–3 short paragraphs separated by \\n\\n
  "topics": string[],         // 2–5 conversation topics
  "vocabulary": [{ "fr": string, "en": string, "example": string }],   // 6–15 words seen in class; example = natural French sentence
  "corrections": [{ "wrong": string, "right": string, "explanation": string }],   // the student's real mistakes
  "grammar": [{ "title": string, "explanation": string, "examples": string[] }],   // EXACTLY ONE item
  "expressions": [{ "fr": string, "en": string, "example": string }],  // 2–6 practical expressions
  "homework": [{ "task": string, "link": string }],   // 1–3 tasks; link = https URL or ""
  "can_do": string[],         // 2–4 items, each starting with "Now I can"
  "exercises": [ ... ]        // 10–14 exercises, see below
}

Recap rules:
- In the transcript, Wael is the tutor; the other speaker is the student. The transcript comes from automatic speech recognition: ignore obvious recognition errors, they are not the student's mistakes.
- Talk directly to the student (second person). Whenever you write French to the student, use "tu", never "vous".
- The summary recaps what you talked about (real topics and details from the conversation) and ends with one encouraging sentence about progress and what to work on next.
- Vocabulary, expressions, corrections and grammar must come from THIS class only: the transcript and the Canva notes. Never invent content that was not covered.
- corrections: take the student's actual mistakes from the transcript (grammar, gender, agreement, word choice, anglicisms). "wrong" quotes what the student said (lightly trimmed), "right" is the natural correct French. Skip hesitations and self-corrections. Up to 12 items, most useful first.
- grammar: ONE grammar point only (micro-learning): the one most related to the student's mistakes or the teacher's notes. Clear rule + 3–5 short examples.
- The Canva notes are raw notes typed during class: fix every typo, spelling, accent and agreement error (e.g. "Tangier" → "Tanger", "allée" → "aller") so the recap is flawless.
- NEVER include: dictation texts, instructions for future oral exercises or role plays, notes or instructions meant for the tutor, lesson plans, or logistics (scheduling, payments, technical problems).
- Do not write personal data such as phone numbers, addresses or emails.
- Explanations (summary, correction explanations, grammar explanation, exercise prompts and explanations, homework) are written in the language given in the student profile: simple English for A1–A2, French for B1 and above. French words, examples and sentences always stay in French. "en" fields are English translations.
- Homework: short and concrete (e.g. write 5 sentences using the grammar point). For video links, only use a YouTube search URL like https://www.youtube.com/results?search_query=... ; otherwise link = "".
- In any text field you may highlight a key word with **double asterisks**. Use \\n for line breaks. No HTML, no other markdown.

Exercise rules (Duolingo-style practice, 10–14 exercises, about 60% "mcq", 25% "fill_blank", 15% "match"):
- Build them ONLY from the vocabulary, the corrected mistakes, the expressions and the grammar point of this lesson. Target the student's real mistakes.
- Sentences must be natural, correct French. Exactly one right answer, never ambiguous.
- Wrong options must be plausible: typical learner errors (wrong auxiliary, missing agreement, wrong gender, false friends, anglicisms), not absurd.
- Exercise shapes (do not add an "id"):
  { "type": "mcq", "prompt": string, "sentence": string, "choices": [string, string, string], "answer": 0|1|2, "explanation": string }
    → exactly 3 different choices; "answer" is the index of the right choice; "sentence" may contain one ___ gap, or be the question itself.
  { "type": "fill_blank", "prompt": string, "sentence": string, "answers": string[], "hint": string, "explanation": string }
    → "sentence" contains EXACTLY ONE ___ ; "answers" lists every accepted spelling (e.g. masculine and feminine forms), 1–3 words each; "hint" helps without giving the answer.
  { "type": "match", "prompt": string, "pairs": [{ "fr": string, "en": string }], "explanation": string }
    → 3–6 pairs of short items, all "fr" different and all "en" different.

Format reference (shortened example of a valid answer, written for an A2 student so its explanations are in English):
${formatExample()}`

function line(label, value) {
  const s = String(value || '').trim()
  return `${label}: ${s || '(not provided)'}`
}

function previousLessonsBlock(previousLessons) {
  if (!previousLessons?.length) return 'PREVIOUS LESSONS: none (this is the first recap for this student).'
  const items = previousLessons.map((l) => {
    const words = (Array.isArray(l.vocabulary) ? l.vocabulary : [])
      .map((v) => v?.fr)
      .filter(Boolean)
      .slice(0, 15)
      .join(', ')
    return `- ${l.lesson_date || ''} — ${l.title || 'Untitled'}${words ? ` (vocabulary: ${words})` : ''}`
  })
  return `PREVIOUS LESSONS (for continuity — avoid repeating this vocabulary unless this class reviewed it):\n${items.join('\n')}`
}

/**
 * @param {{ profile?: object, notes?: string, transcript?: string, canva?: string,
 *           lessonDate?: string, previousLessons?: object[] }} input
 * @returns {{ system: string, user: string }}
 */
export function buildLessonPrompt({ profile, notes, transcript, canva, lessonDate, previousLessons }) {
  const p = profile || {}
  const level = p.level || 'unknown'
  const transcriptText = truncateMiddle(transcript, MAX_TRANSCRIPT)
  const canvaText = truncateMiddle(canva, MAX_CANVA)

  const user = [
    'STUDENT',
    line('Name', p.full_name),
    `Level: ${level} → write explanations in ${explanationLanguage(level)}`,
    line('Goals', p.goals),
    line('Interests', p.interests),
    '',
    `TEACHER'S PRIVATE NOTES (context only, never quote them): ${String(notes || '').trim() || '(none)'}`,
    '',
    line('LESSON DATE', lessonDate),
    '',
    previousLessonsBlock(previousLessons),
    '',
    '===== TRANSCRIPT START =====',
    transcriptText || '(no transcript — rely on the Canva notes)',
    '===== TRANSCRIPT END =====',
    '',
    '===== CANVA NOTES START =====',
    canvaText || '(no Canva notes — rely on the transcript)',
    '===== CANVA NOTES END =====',
    '',
    'Write the lesson recap and the exercises now, as the JSON object described in the instructions.',
  ].join('\n')

  return { system: SYSTEM_PROMPT, user }
}
