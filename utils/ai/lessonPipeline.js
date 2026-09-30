// Generation flow shared by "create lesson", "import lesson" and "regenerate". The
// routes insert (or claim) the row in 'generating', answer 202 and start
// runLessonGeneration in the background (utils/api/background.js). The row then ends
// 'published' or 'failed' with a short French error; only if the database stays
// unreachable does it remain 'generating', and after 5 minutes it counts as stale
// (it can be relaunched). `hidden` is never touched here: it is the teacher's choice.
import { AiError, aiConfig, isDemoMode } from '@/utils/ai/client'
import { generateLesson } from '@/utils/ai/generateLesson'
import { recordGeneration } from '@/utils/ai/ledger'
import { runInBackground } from '@/utils/api/background'

const GENERIC_ERROR = 'La génération a échoué. Réessaie dans un instant.'
const SAVE_ERROR = "La leçon générée n'a pas pu être enregistrée. Relance la génération."
const SAVE_RETRY_DELAY_MS = 1500

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** { id, status, error } as returned by the create / import / regenerate routes. */
export const lessonSummary = (lesson) => ({ id: lesson.id, status: lesson.status, error: lesson.error ?? null })

async function findByClientKey(admin, studentId, clientKey) {
  const { data, error } = await admin
    .from('lessons')
    .select('id, status, error')
    .eq('student_id', studentId)
    .eq('client_key', clientKey)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * Inserts a lesson row in 'generating' for create / import, idempotently: a request
 * repeated with the same (student_id, client_key) gets the lesson created the first
 * time instead of a duplicate.
 * @param {object} row  lessons columns, including student_id and client_key
 * @returns {Promise<{ lesson: object, duplicate: boolean }>}  lesson = full row, or
 *   { id, status, error } for a duplicate
 */
export async function insertGeneratingLesson(admin, row) {
  const existing = await findByClientKey(admin, row.student_id, row.client_key)
  if (existing) return { lesson: existing, duplicate: true }

  const { data, error } = await admin
    .from('lessons')
    .insert({ ...row, status: 'generating', error: null })
    .select('*')
    .single()
  if (!error) return { lesson: data, duplicate: false }
  // Two identical requests at the same moment: the unique index lets only one through
  if (error.code === '23505') {
    const winner = await findByClientKey(admin, row.student_id, row.client_key)
    if (winner) return { lesson: winner, duplicate: true }
  }
  throw error
}

/**
 * Starts the AI on a row already in 'generating' after the response is sent.
 * @returns {{ id: string, status: 'generating', error: null }}
 */
export function startLessonGeneration(admin, lesson, params) {
  runInBackground(() => runLessonGeneration(admin, lesson, params), `lesson ${lesson.id}`)
  return { id: lesson.id, status: 'generating', error: null }
}

// Only student_notes.ai_context reaches the AI: the private notes never do
async function loadContext(admin, lesson) {
  const [profile, notes, previous] = await Promise.all([
    admin.from('profiles').select('full_name, level, goals, interests').eq('id', lesson.student_id).maybeSingle(),
    admin.from('student_notes').select('ai_context').eq('student_id', lesson.student_id).maybeSingle(),
    admin
      .from('lessons')
      .select('title, lesson_date, vocabulary:content->vocabulary')
      .eq('student_id', lesson.student_id)
      .eq('status', 'published')
      .not('content', 'is', null)
      .neq('id', lesson.id)
      .lte('lesson_date', lesson.lesson_date)
      .order('lesson_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(3),
  ])
  for (const r of [profile, notes, previous]) if (r.error) throw r.error
  return {
    profile: profile.data || {},
    aiContext: notes.data?.ai_context || '',
    previousLessons: previous.data || [],
  }
}

// Writes `update` only while the row is still 'generating': a lesson deleted meanwhile
// is not resurrected, and a status changed meanwhile (admin edit) wins. One retry on a
// database error. Returns false when the row was deleted or taken over.
async function writeWhileGenerating(admin, id, update) {
  let lastError
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await sleep(SAVE_RETRY_DELAY_MS)
    const { data, error } = await admin.from('lessons').update(update).eq('id', id).eq('status', 'generating').select('id')
    if (!error) return data.length > 0
    lastError = error
    console.error(`[ai] saving lesson ${id} failed (attempt ${attempt + 1}):`, error)
  }
  throw lastError
}

// A title typed by the teacher while the lesson was generating wins
async function resultTitle(admin, lesson, teacherTitle, aiTitle) {
  const { data, error } = await admin.from('lessons').select('title').eq('id', lesson.id).maybeSingle()
  if (!error && data && data.title !== lesson.title && data.title) return data.title
  return teacherTitle || aiTitle
}

// A failed regeneration keeps the previous version published for the student
async function writeFailure(admin, lesson, message) {
  const update = { status: lesson.content ? 'published' : 'failed', error: message }
  try {
    const written = await writeWhileGenerating(admin, lesson.id, update)
    return { id: lesson.id, status: written ? 'failed' : 'skipped', error: message }
  } catch (err) {
    console.error(`[ai] lesson ${lesson.id} left in 'generating' (stale in 5 min):`, err)
    return { id: lesson.id, status: 'failed', error: message }
  }
}

/**
 * Runs the AI on a lesson row that is already in status 'generating' and stores the
 * result. Imported lessons (source_kind 'import') are generated from source_text.
 * Never throws for AI or database errors (it runs in the background).
 * @param {object} lesson  the row as inserted / claimed (id, student_id, lesson_date, title,
 *   transcript, canva, content, source_kind, source_name, source_text, generation_options)
 * @param {{ title?: string|null, options?: object|null }} params
 *   title = teacher title (wins over the AI title); options = { count, types, instructions }
 *   (defaults to lesson.generation_options)
 * @returns {Promise<{ id: string, status: 'published'|'failed'|'skipped', error: string|null }>}
 *   'skipped' = the lesson was deleted or its status changed during the generation
 */
export async function runLessonGeneration(admin, lesson, { title = null, options = null } = {}) {
  const started = Date.now()
  let generated = null
  let failure = null
  try {
    const context = await loadContext(admin, lesson)
    generated = await generateLesson({
      ...context,
      mode: lesson.source_kind === 'import' ? 'import' : 'transcript',
      transcript: lesson.transcript,
      canva: lesson.canva,
      sourceText: lesson.source_text,
      sourceName: lesson.source_name,
      options: options || lesson.generation_options || null,
      lessonDate: lesson.lesson_date,
    })
  } catch (err) {
    console.error(`[ai] generation failed for lesson ${lesson.id}:`, err)
    failure = err
  }
  const durationMs = Date.now() - started

  let result
  if (generated) {
    const { content, exercises, model, usage } = generated
    try {
      const update = {
        status: 'published',
        error: null,
        content,
        exercises,
        ai_model: model,
        ai_usage: usage || null,
        title: await resultTitle(admin, lesson, title, content.title),
        generated_at: new Date().toISOString(),
      }
      const written = await writeWhileGenerating(admin, lesson.id, update)
      result = { id: lesson.id, status: written ? 'published' : 'skipped', error: null }
    } catch {
      // The result could not be stored (size, constraint, outage): record a failure instead
      result = await writeFailure(admin, lesson, SAVE_ERROR)
    }
  } else {
    result = await writeFailure(admin, lesson, failure instanceof AiError ? failure.message : GENERIC_ERROR)
  }

  const config = aiConfig()
  await recordGeneration(admin, {
    kind: 'lesson',
    lessonId: lesson.id,
    studentId: lesson.student_id,
    model: generated?.model || failure?.model || (isDemoMode(config) ? 'demo' : config.model),
    ok: Boolean(generated) && !result.error,
    error: result.error,
    usage: generated?.usage || failure?.usage || null,
    durationMs,
  })
  return result
}
