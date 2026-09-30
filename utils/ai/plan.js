// « Préparer le prochain cours »: a tutor-facing plan for the student's next class,
// built from the profile, the teacher's AI context and the last lesson recaps, with
// Wael's method (agent.md): warm-up, objectives, presentation, guided practice, free
// practice / role play (the core), wrap-up; 70/30 speaking; one grammar point;
// "Maintenant je peux…". A student without any lesson gets a trial-lesson plan with
// the 4 homework-preference questions. Output in French, for the teacher only.
import { AiError, NOT_CONFIGURED, aiConfig, chatSession, isDemoMode } from '@/utils/ai/client'
import { dataRule, explanationLanguage, fence } from '@/utils/ai/prompt'
import { SAMPLE_PLAN, SAMPLE_TRIAL_PLAN } from '@/utils/ai/planSamples'
import { normalizePlanContent } from '@/utils/lesson/schema'

// Synchronous route: the whole generation (retry included) stays around 90 s
const PLAN_BUDGET_MS = 90_000
const MIN_RETRY_MS = 25_000
const MIN_SECTIONS = 3

const TUTOR =
  'You are the assistant of Wael, a native French tutor on Preply. His classes are conversation-first, relaxed and without judgement.'

const METHOD = `Teaching method (Preply methodology — follow it):
- 70/30 rule: the student speaks 70% of the time. Plan many open questions ("Qu'en penses-tu ?", "Et dans ton pays ?").
- Micro-learning: ONE grammar point (or one small set of vocabulary) per class, always tied to real-life situations and to the student's goals and interests.
- Continuity: recycle the vocabulary and the corrected mistakes of the recent lessons, and build on the homework given last time.
- Objectives are "can do" statements starting with "Maintenant je peux".
- Everything must fit the student's level (simpler French and more support for A1–A2).`

const REGULAR_STRUCTURE = `Structure (sections in this order; minutes add up to about duration_min, 50 by default):
1. "Warm-up" (5–10 min): an open ice-breaker question on the theme and 3–4 follow-up questions, linked to the student's interests or to the last class.
2. "Objectifs" (1–2 min): the exact sentence Wael says, starting with "Aujourd'hui, tu vas apprendre à…".
3. "Présentation" (10–15 min): the grammar point or vocabulary set. Write 4–6 example sentences from which the student deduces the rule, then the rule in 2–3 lines.
4. "Pratique dirigée" (10–15 min): material ready to paste into Canva: a gap-fill text (6–8 gaps written ___) followed by its answers, and a DICTATION text of 3–5 sentences using the target structure, written out in full.
5. "Pratique libre / Jeu de rôle" (15 min, the core of the class): a role play or debate in a real-life situation: the context, Wael's role, the student's role, the goal, 5–8 prompts or questions for Wael, and 4–6 useful expressions to give the student.
6. "Wrap-up" (5 min): recap questions, the recurring mistakes to correct, and short, concrete homework to propose.`

const TRIAL_STRUCTURE = `This student has had no lesson yet: plan a TRIAL lesson (first class). Structure (sections in this order; minutes add up to about duration_min, 50 by default):
1. "Accueil" (5 min): welcome, small talk, put the student at ease, explain how the class will go.
2. "Découverte" (10 min): open questions on goals, needs, previous learning, interests and rhythm.
3. "Mini-évaluation" (10 min): open questions of growing difficulty (A1 to B2) to estimate the spoken level, and what to listen for.
4. "Mini-activité" (15 min): a short conversation or role play adapted to the student's goals, with a quick correction moment.
5. "Devoirs : préférences" (5 min): one line introducing the 4 homework-preference questions (they are added to the plan automatically, do not write them).
6. "Wrap-up" (5 min): level estimate and strengths, proposed learning path for the next classes, next step.`

const OUTPUT = `Reply with ONE JSON object and nothing else (no markdown fences, no comments):
{
  "title": string,          // short plan title in French, max 80 characters
  "duration_min": number,   // total length of the class in minutes (50 unless Wael asks otherwise)
  "objectives": string[],   // 2–4 items, each starting with "Maintenant je peux"
  "sections": [{ "heading": string, "minutes": number, "body": string }]   // the sections above, in order
}
Write everything in French, addressed to Wael ("Demande-lui…", "Montre…"), ready to read during the class. Text is plain: \\n for line breaks, "- " at the start of a line for a list, **double asterisks** to highlight a key word. No HTML, no other markdown (no # titles, no tables). No personal data such as phone numbers, addresses or emails.`

const TEACHER_CONTEXT_RULE =
  'The <TEACHER_CONTEXT> block holds Wael’s own notes about this student: use them freely (this plan is only for him).'

export function buildPlanSystemPrompt(trial) {
  return [
    `${TUTOR} You prepare the plan of his NEXT class with one student. The plan is for Wael only; the student never sees it.`,
    `${dataRule(['STUDENT', 'LESSON_RECAPS'])}\n${TEACHER_CONTEXT_RULE}`,
    METHOD,
    trial ? TRIAL_STRUCTURE : REGULAR_STRUCTURE,
    OUTPUT,
  ].join('\n\n')
}

const lineOf = (label, value) => `${label}: ${String(value || '').trim() || '(not provided)'}`
const joinItems = (items, max, format) =>
  (Array.isArray(items) ? items : [])
    .slice(0, max)
    .map(format)
    .filter(Boolean)
    .join(' ; ')

// One lesson recap as compact text for the prompt
function recapText(lesson) {
  const c = lesson.content || {}
  const parts = [
    `### ${lesson.lesson_date || ''} — ${lesson.title || c.title || 'Sans titre'}`,
    lineOf('Summary', String(c.summary || '').slice(0, 1500)),
    lineOf('Vocabulary', joinItems(c.vocabulary, 15, (v) => (v?.fr ? `${v.fr} = ${v.en || ''}` : ''))),
    lineOf('Expressions', joinItems(c.expressions, 8, (v) => v?.fr || '')),
    lineOf('Corrections', joinItems(c.corrections, 10, (v) => (v?.wrong ? `${v.wrong} → ${v.right || ''}` : ''))),
    lineOf('Grammar', joinItems(c.grammar, 2, (g) => (g?.title ? `${g.title}: ${String(g.explanation || '').slice(0, 300)}` : ''))),
    lineOf('Homework given', joinItems(c.homework, 4, (h) => h?.task || '')),
    lineOf('Can do', joinItems(c.can_do, 4, (x) => (typeof x === 'string' ? x : ''))),
  ]
  return parts.join('\n')
}

/**
 * @param {{ profile?: object, aiContext?: string, recaps?: object[], focus?: string }} input
 *   recaps = lessons { title, lesson_date, content }, most recent first (the plan follows
 *   the first one); none → trial lesson
 * @returns {{ system: string, user: string, trial: boolean }}
 */
export function buildPlanPrompt({ profile, aiContext, recaps = [], focus = '' }) {
  const p = profile || {}
  const level = p.level || 'unknown'
  const trial = recaps.length === 0
  const context = String(aiContext || '').trim()
  const user = [
    `STUDENT LEVEL: ${level}${level === 'unknown' ? ' (estimate it during the class)' : ''} — the student understands explanations best in ${explanationLanguage(level)}`,
    'STUDENT PROFILE (written by the student):',
    fence('STUDENT', [lineOf('Name', p.full_name), lineOf('Goals', p.goals), lineOf('Interests', p.interests)].join('\n')),
    '',
    'TEACHER CONTEXT (Wael’s notes for the AI):',
    context ? fence('TEACHER_CONTEXT', context) : '(none)',
    '',
    trial
      ? 'RECENT LESSONS: none — this is the first class (trial lesson).'
      : `RECENT LESSONS (most recent first; plan the class that comes right after the first one):\n${fence('LESSON_RECAPS', recaps.map(recapText).join('\n\n'))}`,
    '',
    `WAEL'S FOCUS FOR THIS CLASS: ${String(focus || '').trim() || '(none — choose the most useful next step for this student)'}`,
    '',
    'Write the plan now, as the JSON object described in the instructions.',
  ].join('\n')
  return { system: buildPlanSystemPrompt(trial), user, trial }
}

const PLAN_FEEDBACK =
  'IMPORTANT: your previous answer had too few usable sections. Return the COMPLETE JSON object again with every section of the structure (each with a heading, minutes and a detailed body).'

/**
 * @param {{ profile?: object, aiContext?: string, recaps?: object[], focus?: string }} input
 * @returns {Promise<{ content: object, model: string, usage: object|null }>}  content = normalizePlanContent shape
 * @throws {AiError|Error}  with `usage` and `model` attached
 */
export async function generatePlan(input) {
  const config = aiConfig()
  const { system, user, trial } = buildPlanPrompt(input)
  if (isDemoMode(config)) {
    await new Promise((resolve) => setTimeout(resolve, 1200))
    return { content: normalizePlanContent(trial ? SAMPLE_TRIAL_PLAN : SAMPLE_PLAN, { trial }), model: 'demo', usage: null }
  }
  if (!config.apiKey) throw new AiError(NOT_CONFIGURED, { code: 'config' })

  const budget = Math.min(PLAN_BUDGET_MS, config.timeoutMs)
  const session = chatSession({ system, user, deadline: Date.now() + budget, minRetryMs: MIN_RETRY_MS })
  try {
    let content = normalizePlanContent(await session.first(), { trial })
    if (content.sections.length < MIN_SECTIONS && session.canRetry()) {
      const retry = normalizePlanContent(await session.call(PLAN_FEEDBACK), { trial })
      if (retry.sections.length > content.sections.length) content = retry
    }
    if (content.sections.length < MIN_SECTIONS) {
      throw new AiError("L'IA n'a pas produit de plan exploitable. Réessaie.", { code: 'unusable' })
    }
    return { content, model: config.model, usage: session.usage() }
  } catch (err) {
    err.usage = session.usage()
    err.model = config.model
    throw err
  }
}
