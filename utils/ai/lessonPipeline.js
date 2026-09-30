// Generation flow shared by "create lesson", "import lesson" and "regenerate": loads
// the student's context, calls the AI and stores the result on the lesson row. The row
// always ends up 'published' or 'failed' (with a short French error), never stuck.
import { AiError } from '@/utils/ai/client'
import { generateLesson } from '@/utils/ai/generateLesson'
import { fail } from '@/utils/api/errors'
import { LIMITS, hasEnoughText } from '@/utils/api/validate'
import { isStudentAccount } from '@/utils/api/students'

const GENERIC_ERROR = 'La génération a échoué. Réessaie dans un instant.'

/** Length bounds of an imported document's text (after trim). */
export const IMPORT_TEXT_LIMITS = { min: 200, max: 150_000 }

export const MIGRATION_0005_MESSAGE =
  'Base de données pas à jour : exécute supabase/migrations/0005_lesson_import.sql dans Supabase.'

/** Validates an imported document's text (French messages). Returns the trimmed text. */
export function validateImportText(text) {
  if (typeof text !== 'string') fail('Le texte du document est manquant.')
  const t = text.trim()
  if (t.length < IMPORT_TEXT_LIMITS.min) {
    fail(`Le texte du document est trop court (au moins ${IMPORT_TEXT_LIMITS.min} caractères).`)
  }
  if (t.length > IMPORT_TEXT_LIMITS.max) fail('Le texte du document est trop long (max 150 000 caractères).')
  return t
}

/** True if `id` is an existing profile whose account is not a teacher. */
export async function isExistingStudent(admin, id) {
  const { data: profile, error } = await admin.from('profiles').select('id').eq('id', id).maybeSingle()
  if (error) throw error
  return Boolean(profile) && (await isStudentAccount(admin, id))
}

/** PostgREST / Postgres error raised when migration 0005 (lesson import columns) is missing. */
export function isMissingImportColumns(error) {
  return (
    (error?.code === 'PGRST204' || error?.code === '42703') &&
    /source_kind|source_name|source_text|generation_options/.test(error?.message || '')
  )
}

/** Validates transcript/Canva notes (French messages). Returns trimmed strings. */
export function validateSources(transcript, canva) {
  const max = `max ${LIMITS.source} caractères`
  const fields = [
    [transcript, 'La transcription doit être du texte.', `La transcription est trop longue (${max}).`],
    [canva, 'Les notes Canva doivent être du texte.', `Les notes Canva sont trop longues (${max}).`],
  ]
  for (const [value, typeMessage, lengthMessage] of fields) {
    if (value !== undefined && value !== null && typeof value !== 'string') fail(typeMessage)
    if (typeof value === 'string' && value.length > LIMITS.source) fail(lengthMessage)
  }
  const t = (transcript || '').trim()
  const c = (canva || '').trim()
  if (!hasEnoughText(t) && !hasEnoughText(c)) {
    fail('Colle la transcription ou les notes Canva (au moins quelques phrases).')
  }
  return { transcript: t, canva: c }
}

async function loadContext(admin, lesson) {
  const [profile, notes, previous] = await Promise.all([
    admin.from('profiles').select('full_name, level, goals, interests').eq('id', lesson.student_id).maybeSingle(),
    admin.from('student_notes').select('notes').eq('student_id', lesson.student_id).maybeSingle(),
    admin
      .from('lessons')
      .select('title, lesson_date, vocabulary:content->vocabulary')
      .eq('student_id', lesson.student_id)
      .eq('status', 'published')
      .neq('id', lesson.id)
      .lte('lesson_date', lesson.lesson_date)
      .order('lesson_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(3),
  ])
  for (const r of [profile, notes, previous]) if (r.error) throw r.error
  return {
    profile: profile.data || {},
    notes: notes.data?.notes || '',
    previousLessons: previous.data || [],
  }
}

// PostgREST "column not found in schema cache" / Postgres "undefined column"
function isMissingUsageColumn(error) {
  return (error?.code === 'PGRST204' || error?.code === '42703') && /ai_usage/.test(error?.message || '')
}

/**
 * Runs the AI on a lesson row that is already in status 'generating'.
 * Imported lessons (source_kind 'import') are generated from source_text.
 * @param {object} lesson  { id, student_id, lesson_date, transcript, canva, content?,
 *                           source_kind?, source_name?, source_text?, generation_options? }
 * @param {{ title?: string|null, options?: object|null }} params
 *   title = teacher title (wins over the AI title); options = { count, types, instructions }
 *   (defaults to lesson.generation_options)
 * @returns {Promise<{ id: string, status: 'published'|'failed', error: string|null }>}
 */
export async function runLessonGeneration(admin, lesson, { title, options } = {}) {
  let update
  try {
    const context = await loadContext(admin, lesson)
    const mode = lesson.source_kind === 'import' ? 'import' : 'transcript'
    const { content, exercises, model, usage } = await generateLesson({
      ...context,
      mode,
      transcript: lesson.transcript,
      canva: lesson.canva,
      sourceText: lesson.source_text,
      sourceName: lesson.source_name,
      options: options || lesson.generation_options || null,
      lessonDate: lesson.lesson_date,
    })
    update = {
      status: 'published',
      error: null,
      content,
      exercises,
      ai_model: model,
      ai_usage: usage || null,
      title: title || content.title,
      generated_at: new Date().toISOString(),
    }
  } catch (err) {
    console.error(`[ai] generation failed for lesson ${lesson.id}:`, err)
    const message = err instanceof AiError ? err.message : GENERIC_ERROR
    // A failed regeneration keeps the previous version published for the student
    const status = lesson.content ? 'published' : 'failed'
    const { error } = await admin.from('lessons').update({ status, error: message }).eq('id', lesson.id)
    if (error) throw error
    return { id: lesson.id, status: 'failed', error: message }
  }

  let { error } = await admin.from('lessons').update(update).eq('id', lesson.id)
  if (error && isMissingUsageColumn(error)) {
    // Migration 0004 not applied yet: store the lesson without the token usage
    const { ai_usage: _ignored, ...rest } = update
    ;({ error } = await admin.from('lessons').update(rest).eq('id', lesson.id))
  }
  if (error) throw error
  return { id: lesson.id, status: update.status, error: update.error }
}
