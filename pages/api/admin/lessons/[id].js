// GET    /api/admin/lessons/[id] → { lesson, sessions }
// PATCH  /api/admin/lessons/[id] any of { title, lessonDate, status, studentId, driveUrl, content, exercises } → { lesson }
// DELETE /api/admin/lessons/[id] → { success: true } (practice sessions / review attempts cascade)
import { allowMethods, requireAdmin } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { fail, handleError } from '@/utils/api/errors'
import { LIMITS, bodyOf, isIsoDate, isUuid, optionalDriveUrl, optionalText } from '@/utils/api/validate'
import { isStudentAccount } from '@/utils/api/students'
import { logAdminAction } from '@/utils/api/audit'
import { diffFields } from '@/utils/api/admin/query'
import { MAX_EXERCISES, normalizeExercisesForEdit, normalizeLessonContent } from '@/utils/lesson/schema'

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } }

const LESSON_FIELDS =
  'id, student_id, title, lesson_date, status, error, content, exercises, drive_url, transcript, canva, ai_model, ai_usage, generated_at, created_at, updated_at'
const NOT_FOUND = 'Cours introuvable.'
const EDITABLE_STATUSES = ['published', 'failed']
const CONTENT_LISTS = ['topics', 'vocabulary', 'corrections', 'grammar', 'expressions', 'homework', 'can_do']

async function loadLesson(admin, id) {
  const { data: lesson, error } = await admin.from('lessons').select(LESSON_FIELDS).eq('id', id).maybeSingle()
  if (error) throw error
  if (!lesson) return null
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('full_name, email')
    .eq('id', lesson.student_id)
    .maybeSingle()
  if (profileError) throw profileError
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
  error: l.error,
  content: l.content,
  exercises: Array.isArray(l.exercises) ? l.exercises : [],
  drive_url: l.drive_url,
  transcript: l.transcript,
  canva: l.canva,
  ai_model: l.ai_model,
  ai_usage: l.ai_usage ?? null,
  generated_at: l.generated_at,
  created_at: l.created_at,
  updated_at: l.updated_at,
})

function parsePatch(body) {
  const patch = {}
  const title = optionalText(body.title, LIMITS.title, `Le titre doit faire au plus ${LIMITS.title} caractères.`)
  if (title === '') fail('Le titre ne peut pas être vide.')
  if (title !== undefined) patch.title = title
  if (body.lessonDate !== undefined) {
    if (!isIsoDate(body.lessonDate)) fail('Date du cours invalide (format AAAA-MM-JJ).')
    patch.lesson_date = body.lessonDate
  }
  if (body.status !== undefined) {
    if (!EDITABLE_STATUSES.includes(body.status)) fail('Statut invalide (published ou failed).')
    patch.status = body.status
  }
  if (body.studentId !== undefined) {
    if (!isUuid(body.studentId)) fail('Élève invalide.')
    patch.student_id = body.studentId
  }
  const driveUrl = optionalDriveUrl(body.driveUrl, 'Le lien doit être un lien Google Drive en https (https://drive.google.com/…).')
  if (driveUrl !== undefined) patch.drive_url = driveUrl
  if (body.content !== undefined) {
    if (!body.content || typeof body.content !== 'object' || Array.isArray(body.content)) fail('Contenu du cours invalide.')
    patch.content = normalizeLessonContent(body.content)
  }
  if (body.exercises !== undefined) {
    if (!Array.isArray(body.exercises)) fail('La liste des exercices doit être un tableau.')
    if (body.exercises.length > MAX_EXERCISES) fail(`Trop d'exercices (max ${MAX_EXERCISES}).`)
    const exercises = normalizeExercisesForEdit(body.exercises)
    if (body.exercises.length && !exercises.length) {
      fail('Aucun exercice valide : vérifie les champs obligatoires de chaque exercice.')
    }
    patch.exercises = exercises
  }
  if (!Object.keys(patch).length) fail('Aucune modification à enregistrer.')
  return patch
}

function contentSummary(content) {
  const c = content && typeof content === 'object' ? content : {}
  return Object.fromEntries(CONTENT_LISTS.map((k) => [k, Array.isArray(c[k]) ? c[k].length : 0]))
}

// Compact audit diff: plain fields as from/to, content/exercises as counts and ids
function auditDetails(lesson, patch) {
  const { content, exercises, ...plain } = patch
  const changes = diffFields(lesson, plain)
  if (content) changes.content = { changed: true, before: contentSummary(lesson.content), after: contentSummary(content) }
  if (exercises) {
    const beforeIds = lesson.exercises.map((e) => e?.id)
    const afterIds = exercises.map((e) => e.id)
    changes.exercises = {
      count_before: beforeIds.length,
      count_after: afterIds.length,
      added: afterIds.filter((x) => !beforeIds.includes(x)),
      removed: beforeIds.filter((x) => !afterIds.includes(x)),
    }
  }
  return changes
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'PATCH', 'DELETE'])) return
  const auth = await requireAdmin(req, res)
  if (!auth) return
  const { id } = req.query
  if (!isUuid(id)) return res.status(404).json({ error: NOT_FOUND })

  try {
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

    const patch = req.method === 'PATCH' ? parsePatch(bodyOf(req)) : null
    const lesson = await loadLesson(admin, id)
    if (!lesson) return res.status(404).json({ error: NOT_FOUND })

    if (patch) {
      if (patch.student_id && patch.student_id !== lesson.student_id) {
        const { data: profile, error } = await admin.from('profiles').select('id').eq('id', patch.student_id).maybeSingle()
        if (error) throw error
        if (!profile || !(await isStudentAccount(admin, patch.student_id))) fail('Élève introuvable.')
      }
      if (patch.status === 'published' && !(patch.content || lesson.content)) {
        fail('Impossible de publier un cours sans contenu.')
      }
      const details = auditDetails(lesson, patch)
      const { error } = await admin.from('lessons').update(patch).eq('id', id)
      if (error) throw error
      if (Object.keys(details).length) {
        await logAdminAction(admin, auth.user, { action: 'lesson.update', entity: 'lesson', entityId: id, details })
      }
      return res.status(200).json({ lesson: await loadLesson(admin, id) })
    }

    const { data: sessions, error } = await admin
      .from('practice_sessions')
      .select('id, score, total, completed_at')
      .eq('lesson_id', id)
      .order('completed_at', { ascending: false })
    if (error) throw error
    return res.status(200).json({ lesson, sessions: sessions || [] })
  } catch (err) {
    return handleError(res, err, `admin/lessons/[id] ${req.method}`, 'fr')
  }
}
