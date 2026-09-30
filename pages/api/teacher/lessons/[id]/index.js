// GET    /api/teacher/lessons/[id] → { lesson, sessions, older_sessions_count }
//        lesson adds hidden, generated_at, stale, student_level (+ source_*, generation_options);
//        sessions = practice sessions of the current version (at/after generated_at)
// GET    /api/teacher/lessons/[id]?light=1 → { lesson: { id, status, error, stale, hidden, title, updated_at } }
//        for polling during a generation (no sources, content or sessions)
// PATCH  /api/teacher/lessons/[id] any of { title, lessonDate, driveUrl, hidden,
//        removeExerciseIds, exercises, dismissError, expectedUpdatedAt, version } → { lesson }
//        dismissError: true clears the error of a failed regeneration (the previous
//        version stays published) so it leaves the dashboard's « À traiter » list
//        version = the generated_at the page shows; send it with removeExerciseIds:
//        every regeneration numbers its exercises ex_1…ex_N again, so an id only
//        names the same exercise within one version
//        409 { code: 'conflict' } when the lesson changed since expectedUpdatedAt, or
//        was regenerated / had its exercises edited since `version`;
//        409 { code: 'generating' } when editing exercises during a generation
//        An `exercises` array that only removes or reorders exercises keeps generated_at
//        (results stay valid); an added or changed exercise bumps it (progress restarts).
//        Items identical to the stored exercise are kept as stored (never re-validated)
// DELETE /api/teacher/lessons/[id] → { success: true }
//        409 { code: 'generating' } while a generation runs (not once it is stale)
import { allowMethods, requireTeacher } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { HttpError, fail, handleError } from '@/utils/api/errors'
import {
  LIMITS,
  allowSameOrigin,
  bodyOf,
  isIsoDate,
  isUuid,
  optionalBoolean,
  optionalDriveUrl,
  optionalText,
} from '@/utils/api/validate'
import { exercisesResetProgress } from '@/utils/api/admin/lessonEdit'
import { isSameVersion, lessonVersion } from '@/utils/api/studentLessons'
import { MAX_EXERCISES, invalidEditedExercises, isStaleGeneration, normalizeExercisesForEdit } from '@/utils/lesson/schema'

export const config = { api: { bodyParser: { sizeLimit: '1mb' } } }

const NOT_FOUND = 'Leçon introuvable.'
const MAX_REMOVE = 100
const MAX_VERSION_LENGTH = 64
const CONFLICT = 'Cette leçon vient d’être modifiée ailleurs. Recharge la page pour voir la dernière version.'
const GENERATING = 'Une génération est en cours : attends qu’elle se termine avant de modifier les exercices.'
const DELETE_GENERATING = 'Une génération est en cours : attends qu’elle se termine avant de supprimer la leçon.'
const LIGHT_FIELDS = 'id, status, error, hidden, title, updated_at'

async function loadLesson(admin, id) {
  const { data: lesson, error } = await admin.from('lessons').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!lesson) return null

  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('full_name, email, level')
    .eq('id', lesson.student_id)
    .maybeSingle()
  if (profileError) throw profileError

  return {
    ...lesson,
    student_name: profile?.full_name || profile?.email || '',
    student_level: profile?.level || null,
    exercises: Array.isArray(lesson.exercises) ? lesson.exercises : [],
  }
}

// Fixed key order, matching the documented shape
const serialize = (l) => ({
  id: l.id,
  student_id: l.student_id,
  student_name: l.student_name,
  student_level: l.student_level,
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
  ai_model: l.ai_model,
  generated_at: l.generated_at,
  created_at: l.created_at,
  updated_at: l.updated_at,
  source_kind: l.source_kind || 'transcript',
  source_name: l.source_name ?? null,
  source_text: l.source_text ?? null,
  generation_options: l.generation_options ?? null,
})

// Practice sessions of the current version, and how many older ones exist
async function loadSessions(admin, lesson) {
  let current = admin
    .from('practice_sessions')
    .select('score, total, completed_at')
    .eq('lesson_id', lesson.id)
    .order('completed_at', { ascending: false })
  if (lesson.generated_at) current = current.gte('completed_at', lesson.generated_at)

  const older = lesson.generated_at
    ? admin
        .from('practice_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('lesson_id', lesson.id)
        .lt('completed_at', lesson.generated_at)
    : null

  const [sessions, olderCount] = await Promise.all([current, older])
  if (sessions.error) throw sessions.error
  if (olderCount?.error) throw olderCount.error
  return { sessions: sessions.data || [], older_sessions_count: olderCount?.count || 0 }
}

// Each item is checked against the stored exercises in buildUpdate
function parseExercises(value) {
  if (!Array.isArray(value)) fail('La liste des exercices est invalide.')
  if (value.length > MAX_EXERCISES) fail(`Une leçon peut contenir au plus ${MAX_EXERCISES} exercices.`)
  return value
}

// Every changed exercise must be valid (a silently dropped one would be lost work);
// untouched ones are kept as stored, even if saved under older rules. All the
// invalid positions are listed, so several can be fixed in one save.
function assertValidExercises(raw, stored) {
  const invalid = invalidEditedExercises(raw, { stored })
  if (!invalid.length) return
  const detail = '(consigne, phrase avec ___, choix ou réponses)'
  fail(
    invalid.length === 1
      ? `L’exercice n° ${invalid[0]} est incomplet ou invalide ${detail}.`
      : `Les exercices n° ${invalid.join(', ')} sont incomplets ou invalides ${detail}.`
  )
}

// generated_at the page showed ('' for a lesson without one)
function parseVersion(value) {
  if (value === undefined) return undefined
  if (value === null) return ''
  if (typeof value !== 'string' || value.length > MAX_VERSION_LENGTH) fail('Version de la leçon invalide.')
  return value
}

function parsePatch(body) {
  const title = optionalText(body.title, LIMITS.title, `Le titre doit faire au plus ${LIMITS.title} caractères.`)
  if (title === '') fail('Le titre ne peut pas être vide.')
  if (body.lessonDate !== undefined && !isIsoDate(body.lessonDate)) fail('Date du cours invalide (format AAAA-MM-JJ).')
  const driveUrl = optionalDriveUrl(
    body.driveUrl,
    'Le lien doit être un lien Google Drive ou Google Docs en https (https://drive.google.com/… ou https://docs.google.com/…).'
  )
  const hidden = optionalBoolean(body.hidden, 'Le champ « masquée » est invalide.')
  const dismissError = optionalBoolean(body.dismissError, 'Le champ « ignorer l’erreur » est invalide.') === true || undefined

  let removeIds
  if (body.removeExerciseIds !== undefined) {
    const ids = body.removeExerciseIds
    const valid = Array.isArray(ids) && ids.length <= MAX_REMOVE && ids.every((x) => typeof x === 'string' && x.length <= 40)
    if (!valid) fail('Liste d’exercices à supprimer invalide.')
    removeIds = new Set(ids)
  }
  const exercises = body.exercises !== undefined ? parseExercises(body.exercises) : undefined
  if (removeIds && exercises) fail('Envoie soit la liste complète des exercices, soit les exercices à supprimer, pas les deux.')

  // updated_at the editor started from (compared at millisecond precision)
  let expectedUpdatedAt
  if (body.expectedUpdatedAt !== undefined && body.expectedUpdatedAt !== null) {
    expectedUpdatedAt = typeof body.expectedUpdatedAt === 'string' ? Date.parse(body.expectedUpdatedAt) : Number.NaN
    if (!Number.isFinite(expectedUpdatedAt)) fail('Version de la leçon invalide.')
  }

  const version = parseVersion(body.version)

  if ([title, body.lessonDate, driveUrl, hidden, removeIds, exercises, dismissError].every((v) => v === undefined)) {
    fail('Aucune modification à enregistrer.')
  }
  return { title, lessonDate: body.lessonDate, driveUrl, hidden, removeIds, exercises, dismissError, expectedUpdatedAt, version }
}

function buildUpdate(lesson, patch) {
  const update = {}
  if (patch.title !== undefined) update.title = patch.title
  if (patch.lessonDate !== undefined) update.lesson_date = patch.lessonDate
  if (patch.driveUrl !== undefined) update.drive_url = patch.driveUrl
  if (patch.hidden !== undefined) update.hidden = patch.hidden
  // Only a published lesson's error (failed regeneration): a failed first generation keeps its reason
  if (patch.dismissError && lesson.status === 'published') update.error = null
  // Ids stay stable: removed exercises are dropped, the others are not renumbered.
  // A pure removal keeps generated_at (results on the other exercises stay valid).
  if (patch.removeIds) update.exercises = lesson.exercises.filter((e) => !patch.removeIds.has(e?.id))
  if (patch.exercises) {
    assertValidExercises(patch.exercises, lesson.exercises)
    // Stored ids stay reserved: a new exercise never takes the id of a removed one
    update.exercises = normalizeExercisesForEdit(patch.exercises, {
      reservedIds: lesson.exercises.map((e) => e?.id),
      stored: lesson.exercises,
    })
    // Added or changed exercises: earlier results no longer match them (progress restarts)
    if (exercisesResetProgress(lesson.exercises, update.exercises)) update.generated_at = new Date().toISOString()
  }
  return update
}

// Applies the patch. Exercise changes (and any patch with expectedUpdatedAt) are
// written only if the row did not change since it was read; a removal is retried
// once on a fresh read, since it can be re-applied safely — but only on the same
// version (exercise ids are renumbered by each regeneration).
async function patchLesson(admin, id, patch) {
  const touchesExercises = Boolean(patch.removeIds || patch.exercises)
  let version = patch.version // the version the client saw, then the one read here
  for (let attempt = 0; attempt < 2; attempt++) {
    const lesson = await loadLesson(admin, id)
    if (!lesson) throw new HttpError(404, NOT_FOUND)
    if (patch.expectedUpdatedAt !== undefined && Date.parse(lesson.updated_at) !== patch.expectedUpdatedAt) {
      throw new HttpError(409, CONFLICT, 'conflict')
    }
    if (version !== undefined && !isSameVersion(version, lesson)) throw new HttpError(409, CONFLICT, 'conflict')
    version = lessonVersion(lesson)
    if (touchesExercises && lesson.status === 'generating' && !isStaleGeneration(lesson)) {
      throw new HttpError(409, GENERATING, 'generating')
    }

    const update = buildUpdate(lesson, patch)
    if (!Object.keys(update).length) return // e.g. dismissError on a lesson without a regeneration error

    let query = admin.from('lessons').update(update).eq('id', id)
    if (touchesExercises || patch.expectedUpdatedAt !== undefined) query = query.eq('updated_at', lesson.updated_at)
    const { data, error } = await query.select('id')
    if (error) throw error
    if (data.length) return
    // Changed (or deleted) between the read and the write: only a pure removal may be re-applied
    if (!patch.removeIds || patch.expectedUpdatedAt !== undefined) break
  }
  const { data: exists, error } = await admin.from('lessons').select('id').eq('id', id).maybeSingle()
  if (error) throw error
  throw exists ? new HttpError(409, CONFLICT, 'conflict') : new HttpError(404, NOT_FOUND)
}

// Polling payload: the status fields only (the full row carries up to 150 000
// characters of sources, sent every 4 s otherwise)
async function loadLight(admin, id) {
  const { data, error } = await admin.from('lessons').select(LIGHT_FIELDS).eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id,
    status: data.status,
    error: data.error,
    stale: isStaleGeneration(data),
    hidden: Boolean(data.hidden),
    title: data.title,
    updated_at: data.updated_at,
  }
}

// Refused while a generation runs (its result would be thrown away with the lesson).
// The delete only applies to the row as checked: a generation claimed in between wins.
async function deleteLesson(admin, id) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data: lesson, error } = await admin.from('lessons').select('id, status, updated_at').eq('id', id).maybeSingle()
    if (error) throw error
    if (!lesson) throw new HttpError(404, NOT_FOUND)
    if (lesson.status === 'generating' && !isStaleGeneration(lesson)) {
      throw new HttpError(409, DELETE_GENERATING, 'generating')
    }
    const { data, error: deleteError } = await admin.from('lessons').delete().eq('id', id).eq('updated_at', lesson.updated_at).select('id')
    if (deleteError) throw deleteError
    if (data.length) return
  }
  throw new HttpError(409, CONFLICT, 'conflict')
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'PATCH', 'DELETE'])) return
  if (!allowSameOrigin(req, res)) return
  if (!(await requireTeacher(req, res))) return
  const { id } = req.query
  if (!isUuid(id)) return res.status(404).json({ error: NOT_FOUND })

  try {
    const admin = createAdminClient()

    if (req.method === 'DELETE') {
      await deleteLesson(admin, id)
      return res.status(200).json({ success: true })
    }

    if (req.method === 'PATCH') {
      await patchLesson(admin, id, parsePatch(bodyOf(req)))
      const lesson = await loadLesson(admin, id)
      if (!lesson) return res.status(404).json({ error: NOT_FOUND })
      return res.status(200).json({ lesson: serialize(lesson) })
    }

    if (req.query.light === '1') {
      const light = await loadLight(admin, id)
      if (!light) return res.status(404).json({ error: NOT_FOUND })
      return res.status(200).json({ lesson: light })
    }

    const lesson = await loadLesson(admin, id)
    if (!lesson) return res.status(404).json({ error: NOT_FOUND })
    const { sessions, older_sessions_count } = await loadSessions(admin, lesson)
    return res.status(200).json({ lesson: serialize(lesson), sessions, older_sessions_count })
  } catch (err) {
    return handleError(res, err, `teacher/lessons/[id] ${req.method}`, 'fr')
  }
}
