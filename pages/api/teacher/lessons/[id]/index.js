// GET    /api/teacher/lessons/[id] → { lesson, sessions } (lesson includes source_kind,
//        source_name, source_text, generation_options)
// PATCH  /api/teacher/lessons/[id] any of { title, lessonDate, driveUrl, removeExerciseIds } → { lesson }
// DELETE /api/teacher/lessons/[id] → { success: true }
import { allowMethods, requireTeacher } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { fail, handleError } from '@/utils/api/errors'
import { LIMITS, bodyOf, isIsoDate, isUuid, optionalDriveUrl, optionalText } from '@/utils/api/validate'

// '*' so the route keeps working before migration 0005 (lesson import columns)
const LESSON_FIELDS = '*'
const NOT_FOUND = 'Cours introuvable.'
const MAX_REMOVE = 100

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

  return {
    ...lesson,
    student_name: profile?.full_name || profile?.email || '',
    exercises: Array.isArray(lesson.exercises) ? lesson.exercises : [],
  }
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
  exercises: l.exercises,
  drive_url: l.drive_url,
  transcript: l.transcript,
  canva: l.canva,
  ai_model: l.ai_model,
  created_at: l.created_at,
  updated_at: l.updated_at,
  // Defaults when migration 0005 is not applied yet
  source_kind: l.source_kind || 'transcript',
  source_name: l.source_name ?? null,
  source_text: l.source_text ?? null,
  generation_options: l.generation_options ?? null,
})

function parsePatch(body) {
  const title = optionalText(body.title, LIMITS.title, `Le titre doit faire au plus ${LIMITS.title} caractères.`)
  if (title === '') fail('Le titre ne peut pas être vide.')
  if (body.lessonDate !== undefined && !isIsoDate(body.lessonDate)) fail('Date du cours invalide (format AAAA-MM-JJ).')
  const driveUrl = optionalDriveUrl(body.driveUrl, 'Le lien doit être un lien Google Drive en https (https://drive.google.com/…).')

  let removeIds
  if (body.removeExerciseIds !== undefined) {
    const ids = body.removeExerciseIds
    const valid = Array.isArray(ids) && ids.length <= MAX_REMOVE && ids.every((x) => typeof x === 'string' && x.length <= 40)
    if (!valid) fail('Liste d’exercices à supprimer invalide.')
    removeIds = new Set(ids)
  }

  if ([title, body.lessonDate, driveUrl, removeIds].every((v) => v === undefined)) fail('Aucune modification à enregistrer.')
  return { title, lessonDate: body.lessonDate, driveUrl, removeIds }
}

async function patchLesson(admin, lesson, patch) {
  const update = {}
  if (patch.title !== undefined) update.title = patch.title
  if (patch.lessonDate !== undefined) update.lesson_date = patch.lessonDate
  if (patch.driveUrl !== undefined) update.drive_url = patch.driveUrl
  // Ids stay stable: removed exercises are dropped, the others are not renumbered
  if (patch.removeIds) update.exercises = lesson.exercises.filter((e) => !patch.removeIds.has(e.id))

  const { error } = await admin.from('lessons').update(update).eq('id', lesson.id)
  if (error) throw error
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'PATCH', 'DELETE'])) return
  if (!(await requireTeacher(req, res))) return
  const { id } = req.query
  if (!isUuid(id)) return res.status(404).json({ error: NOT_FOUND })

  try {
    const admin = createAdminClient()

    if (req.method === 'DELETE') {
      const { data, error } = await admin.from('lessons').delete().eq('id', id).select('id')
      if (error) throw error
      if (!data?.length) return res.status(404).json({ error: NOT_FOUND })
      return res.status(200).json({ success: true })
    }

    const patch = req.method === 'PATCH' ? parsePatch(bodyOf(req)) : null
    const lesson = await loadLesson(admin, id)
    if (!lesson) return res.status(404).json({ error: NOT_FOUND })

    if (patch) {
      await patchLesson(admin, lesson, patch)
      return res.status(200).json({ lesson: serialize(await loadLesson(admin, id)) })
    }

    const { data: sessions, error } = await admin
      .from('practice_sessions')
      .select('score, total, completed_at')
      .eq('lesson_id', id)
      .order('completed_at', { ascending: false })
    if (error) throw error

    return res.status(200).json({ lesson: serialize(lesson), sessions: sessions || [] })
  } catch (err) {
    return handleError(res, err, `teacher/lessons/[id] ${req.method}`, 'fr')
  }
}
