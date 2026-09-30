// GET    /api/admin/lessons/[id] → { lesson, sessions, review_count }
//        sessions: every practice session, `current` = graded the current version (at/after generated_at)
// PATCH  /api/admin/lessons/[id] any of { title, lessonDate, status, studentId, driveUrl, hidden,
//        content, exercises, expectedUpdatedAt } → { lesson }
//        409 { code: 'conflict' } when the lesson changed since expectedUpdatedAt (or during the save);
//        409 { code: 'generating' } while a generation runs (only `hidden` may change then);
//        a stuck generation (stale) must get a `status` with any save, which ends it.
//        A status change also sets `error`: cleared once published, a reason when failed.
// DELETE /api/admin/lessons/[id] → { success: true } (practice sessions / review attempts cascade)
import { allowMethods, normalizeUuid, requireAdmin } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { HttpError, fail, handleError } from '@/utils/api/errors'
import { LIMITS, bodyOf, isIsoDate, isUuid, optionalBoolean, optionalDriveUrl, optionalText } from '@/utils/api/validate'
import { isExistingStudent } from '@/utils/api/students'
import { currentSince, isCurrent } from '@/utils/api/progress'
import { logAdminAction } from '@/utils/api/audit'
import { countRows, diffFields } from '@/utils/api/admin/query'
import { assertJsonBody } from '@/utils/api/admin/guard'
import {
  contentProblems,
  errorForStatus,
  exercisesResetProgress,
  generationBlock,
  invalidExercisePositions,
} from '@/utils/api/admin/lessonEdit'
import { MAX_EXERCISES, isStaleGeneration, normalizeExercisesForEdit, normalizeLessonContent } from '@/utils/lesson/schema'

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } }

const LESSON_FIELDS =
  'id, student_id, title, lesson_date, status, error, hidden, content, exercises, drive_url, transcript, canva, ' +
  'source_kind, source_name, source_text, generation_options, ai_model, ai_usage, generated_at, created_at, updated_at'
const NOT_FOUND = 'Leçon introuvable.'
const CONFLICT = 'Cette leçon a été modifiée ailleurs.'
const GENERATING = 'Génération en cours : la leçon est en lecture seule jusqu’à la fin.'
const STUCK = 'Génération bloquée : choisis aussi un statut (Publiée ou Échec) pour enregistrer.'
const EDITABLE_STATUSES = ['published', 'failed']
const CONTENT_LISTS = ['topics', 'vocabulary', 'corrections', 'grammar', 'expressions', 'homework', 'can_do']

async function loadRow(admin, id) {
  const { data, error } = await admin.from('lessons').select(LESSON_FIELDS).eq('id', id).maybeSingle()
  if (error) throw error
  return data ? { ...data, exercises: Array.isArray(data.exercises) ? data.exercises : [] } : null
}

async function withStudentName(admin, lesson) {
  const { data: profile, error } = await admin.from('profiles').select('full_name, email').eq('id', lesson.student_id).maybeSingle()
  if (error) throw error
  return serialize({ ...lesson, student_name: profile?.full_name || profile?.email || '' })
}

// Fixed key order, matching the documented shape
const serialize = (l) => ({
  id: l.id,
  student_id: l.student_id,
  student_name: l.student_name,
  title: l.title,
  lesson_date: l.lesson_date,
  status: l.status,
  stale: isStaleGeneration(l),
  error: l.error,
  hidden: Boolean(l.hidden),
  content: l.content,
  exercises: l.exercises,
  drive_url: l.drive_url,
  transcript: l.transcript,
  canva: l.canva,
  source_kind: l.source_kind || 'transcript',
  source_name: l.source_name ?? null,
  source_text: l.source_text ?? null,
  generation_options: l.generation_options ?? null,
  ai_model: l.ai_model,
  ai_usage: l.ai_usage ?? null,
  generated_at: l.generated_at,
  created_at: l.created_at,
  updated_at: l.updated_at,
})

function parseContent(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('Contenu de la leçon invalide.')
  const problems = contentProblems(value)
  if (problems.length) {
    const more = problems.length > 3 ? ` (et ${problems.length - 3} autre${problems.length > 4 ? 's' : ''})` : ''
    fail(`Contenu non enregistré — ${problems.slice(0, 3).join(' ; ')}${more}.`)
  }
  return normalizeLessonContent(value)
}

// Each item is checked against the stored exercises in patchLesson
function parseExercises(value) {
  if (!Array.isArray(value)) fail('La liste des exercices doit être un tableau.')
  if (value.length > MAX_EXERCISES) fail(`Une leçon peut contenir au plus ${MAX_EXERCISES} exercices.`)
  return value
}

// Every changed exercise must be valid (a silently dropped one would be lost work); one
// left as stored is kept even if saved under older rules, so it never blocks the others
function assertValidExercises(raw, stored) {
  const invalid = invalidExercisePositions(raw, { stored })
  if (!invalid.length) return
  const many = invalid.length > 1
  fail(
    `Exercice${many ? 's' : ''} n° ${invalid.join(', ')} incomplet${many ? 's' : ''} ou invalide${many ? 's' : ''} ` +
      '(phrase avec ___, 3 choix différents, réponses, paires uniques…). Rien n’a été enregistré.'
  )
}

/** @returns {{ patch: object, expectedUpdatedAt?: number }}  patch uses column names */
function parsePatch(body) {
  const patch = {}
  const title = optionalText(body.title, LIMITS.title, `Le titre doit faire au plus ${LIMITS.title} caractères.`)
  if (title === '') fail('Le titre ne peut pas être vide.')
  if (title !== undefined) patch.title = title
  if (body.lessonDate !== undefined) {
    if (!isIsoDate(body.lessonDate)) fail('Date de la leçon invalide (format AAAA-MM-JJ).')
    patch.lesson_date = body.lessonDate
  }
  if (body.status !== undefined) {
    if (!EDITABLE_STATUSES.includes(body.status)) fail('Statut invalide (published ou failed).')
    patch.status = body.status
  }
  if (body.studentId !== undefined) {
    if (!isUuid(body.studentId)) fail('Élève invalide.')
    patch.student_id = normalizeUuid(body.studentId)
  }
  const hidden = optionalBoolean(body.hidden, 'La visibilité doit être un booléen.')
  if (hidden !== undefined) patch.hidden = hidden
  const driveUrl = optionalDriveUrl(body.driveUrl, 'Le lien doit être un lien Google Drive ou Docs en https (https://drive.google.com/…).')
  if (driveUrl !== undefined) patch.drive_url = driveUrl
  if (body.content !== undefined) patch.content = parseContent(body.content)
  if (body.exercises !== undefined) patch.exercises = parseExercises(body.exercises)

  // updated_at the editor started from (compared at millisecond precision)
  let expectedUpdatedAt
  if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== null) {
    expectedUpdatedAt = typeof body.expectedUpdatedAt === 'string' ? Date.parse(body.expectedUpdatedAt) : Number.NaN
    if (!Number.isFinite(expectedUpdatedAt)) fail('Version de la leçon invalide.')
  }
  if (!Object.keys(patch).length) fail('Aucune modification à enregistrer.')
  return { patch, expectedUpdatedAt }
}

// Results already recorded belong to the current student: moving them would mix two
// students' histories, dropping them would lose them silently.
async function assertReassignable(admin, lessonId, studentId) {
  if (!(await isExistingStudent(admin, studentId))) fail('Élève introuvable (il faut un compte élève approuvé).')
  const [sessions, reviews] = await Promise.all([
    countRows(admin, 'practice_sessions', (q) => q.eq('lesson_id', lessonId)),
    countRows(admin, 'review_attempts', (q) => q.eq('lesson_id', lessonId)),
  ])
  if (sessions || reviews) {
    fail('Impossible de changer d’élève : cette leçon a déjà des résultats (entraînements ou révisions). Supprime-la et recrée-la pour l’autre élève.')
  }
}

function contentSummary(content) {
  const c = content && typeof content === 'object' ? content : {}
  return Object.fromEntries(CONTENT_LISTS.map((k) => [k, Array.isArray(c[k]) ? c[k].length : 0]))
}

// Compact audit diff: plain fields as from/to, content/exercises as counts and ids
function auditDetails(lesson, update) {
  const { content, exercises, generated_at: generatedAt, ...plain } = update
  const changes = diffFields(lesson, plain)
  if (content && JSON.stringify(content) !== JSON.stringify(lesson.content)) {
    changes.content = { changed: true, before: contentSummary(lesson.content), after: contentSummary(content) }
  }
  if (exercises && JSON.stringify(exercises) !== JSON.stringify(lesson.exercises)) {
    const beforeIds = lesson.exercises.map((e) => e?.id)
    const afterIds = exercises.map((e) => e.id)
    changes.exercises = {
      count_before: beforeIds.length,
      count_after: afterIds.length,
      added: afterIds.filter((x) => !beforeIds.includes(x)),
      removed: beforeIds.filter((x) => !afterIds.includes(x)),
    }
  }
  if (generatedAt) changes.progress_reset = true
  return changes
}

async function patchLesson(admin, id, { patch, expectedUpdatedAt }) {
  const lesson = await loadRow(admin, id)
  if (!lesson) throw new HttpError(404, NOT_FOUND)
  if (expectedUpdatedAt !== undefined && Date.parse(lesson.updated_at) !== expectedUpdatedAt) {
    throw new HttpError(409, CONFLICT, 'conflict')
  }
  const blocked = generationBlock(lesson, patch)
  if (blocked === 'generating') throw new HttpError(409, GENERATING, 'generating')
  if (blocked === 'stuck') fail(STUCK)

  const update = { ...patch }
  if (update.student_id === lesson.student_id) delete update.student_id
  if (update.student_id) await assertReassignable(admin, id, update.student_id)
  if (update.status === 'published' && !(update.content || lesson.content)) fail('Impossible de publier une leçon sans contenu.')
  const statusError = errorForStatus(lesson, update.status)
  if (statusError !== undefined && statusError !== lesson.error) update.error = statusError
  if (update.exercises) {
    assertValidExercises(update.exercises, lesson.exercises)
    // Stored ids stay reserved (a new exercise never takes a removed one's id), untouched
    // exercises are kept exactly as stored
    update.exercises = normalizeExercisesForEdit(update.exercises, {
      reservedIds: lesson.exercises.map((e) => e?.id),
      stored: lesson.exercises,
    })
    // New or edited exercises: earlier results no longer match them (progress restarts)
    if (exercisesResetProgress(lesson.exercises, update.exercises)) update.generated_at = new Date().toISOString()
  }

  const details = auditDetails(lesson, update)
  if (!Object.keys(details).length) return null

  // Written only if the row did not change since it was read (teacher, pipeline, other tab)
  const { data, error } = await admin.from('lessons').update(update).eq('id', id).eq('updated_at', lesson.updated_at).select('id')
  if (error) throw error
  if (!data?.length) {
    const { data: exists, error: existsError } = await admin.from('lessons').select('id').eq('id', id).maybeSingle()
    if (existsError) throw existsError
    throw exists ? new HttpError(409, CONFLICT, 'conflict') : new HttpError(404, NOT_FOUND)
  }
  return details
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'PATCH', 'DELETE'])) return
  const auth = await requireAdmin(req, res)
  if (!auth) return
  if (!isUuid(req.query.id)) return res.status(404).json({ error: NOT_FOUND })
  const id = normalizeUuid(req.query.id)

  try {
    assertJsonBody(req)
    const admin = createAdminClient()

    if (req.method === 'DELETE') {
      const { data, error } = await admin.from('lessons').delete().eq('id', id).select('id, title, student_id')
      if (error) throw error
      if (!data?.length) return res.status(404).json({ error: NOT_FOUND })
      await logAdminAction(admin, auth.user, {
        action: 'lesson.delete',
        entity: 'lesson',
        entityId: id,
        details: { title: data[0].title, student_id: data[0].student_id },
      })
      return res.status(200).json({ success: true })
    }

    if (req.method === 'PATCH') {
      const details = await patchLesson(admin, id, parsePatch(bodyOf(req)))
      if (details) await logAdminAction(admin, auth.user, { action: 'lesson.update', entity: 'lesson', entityId: id, details })
      const lesson = await loadRow(admin, id)
      if (!lesson) return res.status(404).json({ error: NOT_FOUND })
      return res.status(200).json({ lesson: await withStudentName(admin, lesson) })
    }

    const row = await loadRow(admin, id)
    if (!row) return res.status(404).json({ error: NOT_FOUND })
    const [lesson, sessions, reviewCount] = await Promise.all([
      withStudentName(admin, row),
      admin
        .from('practice_sessions')
        .select('id, score, total, completed_at')
        .eq('lesson_id', id)
        .order('completed_at', { ascending: false }),
      countRows(admin, 'review_attempts', (q) => q.eq('lesson_id', id)),
    ])
    if (sessions.error) throw sessions.error
    const since = currentSince([row])
    return res.status(200).json({
      lesson,
      sessions: (sessions.data || []).map((s) => ({ ...s, current: isCurrent(since, id, s.completed_at) })),
      review_count: reviewCount,
    })
  } catch (err) {
    return handleError(res, err, `admin/lessons/[id] ${req.method}`, 'fr')
  }
}
