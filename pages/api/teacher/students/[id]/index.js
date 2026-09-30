// GET   /api/teacher/students/[id] → { student, notes, ai_context, lessons }
//       student adds approved, last_sign_in_at, email_confirmed; lessons add hidden,
//       source_kind ('transcript' | 'import') and stale, and count only practice of
//       their current version (at/after generated_at)
// PATCH /api/teacher/students/[id] any of { fullName, level, goals, interests, driveFolderUrl,
//       notes, aiContext } → same shape
// notes = private (never sent to the AI); ai_context = « Contexte pour l'IA ».
import { allowMethods, requireTeacher } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { fail, handleError } from '@/utils/api/errors'
import { LIMITS, allowSameOrigin, bodyOf, isUuid, optionalDriveUrl, optionalLevel, optionalText } from '@/utils/api/validate'
import { accountFields, getAuthUser, isStudentUser, selectAll } from '@/utils/api/students'
import { exerciseCount, progressByLesson, progressOf } from '@/utils/api/progress'
import { isStaleGeneration } from '@/utils/lesson/schema'

const STUDENT_FIELDS = 'id, email, full_name, level, goals, interests, drive_folder_url, onboarded_at, created_at'
const NOT_FOUND = 'Élève introuvable.'

async function loadStudent(admin, user) {
  const id = user.id
  const [student, notes, lessons, sessions] = await Promise.all([
    admin.from('profiles').select(STUDENT_FIELDS).eq('id', id).maybeSingle(),
    admin.from('student_notes').select('notes, ai_context').eq('student_id', id).maybeSingle(),
    admin
      .from('lessons')
      .select('id, title, lesson_date, status, error, hidden, source_kind, exercises, generated_at, created_at, updated_at')
      .eq('student_id', id)
      .order('lesson_date', { ascending: false })
      .order('created_at', { ascending: false }),
    // Every run, page by page (a single request stops at PostgREST's max-rows)
    selectAll(() =>
      admin
        .from('practice_sessions')
        .select('id, lesson_id, score, total, completed_at')
        .eq('student_id', id)
        .order('completed_at')
        .order('id')
    ),
  ])
  for (const r of [student, notes, lessons]) if (r.error) throw r.error
  if (!student.data) return null

  const lessonRows = lessons.data || []
  const progress = progressByLesson(sessions, lessonRows)
  return {
    student: { ...student.data, ...accountFields(user) },
    notes: notes.data?.notes || '',
    ai_context: notes.data?.ai_context || '',
    lessons: lessonRows.map((l) => ({
      id: l.id,
      title: l.title,
      lesson_date: l.lesson_date,
      status: l.status,
      stale: isStaleGeneration(l),
      error: l.error,
      hidden: Boolean(l.hidden),
      source_kind: l.source_kind || 'transcript',
      exercise_count: exerciseCount(l.exercises),
      created_at: l.created_at,
      updated_at: l.updated_at,
      ...progressOf(progress, l.id),
    })),
  }
}

function parsePatch(body) {
  const patch = {
    fullName: optionalText(body.fullName, LIMITS.fullName, `Le nom doit faire au plus ${LIMITS.fullName} caractères.`),
    level: optionalLevel(body.level, 'Niveau invalide.'),
    goals: optionalText(body.goals, LIMITS.profileText, `Les objectifs doivent faire au plus ${LIMITS.profileText} caractères.`),
    interests: optionalText(body.interests, LIMITS.profileText, `Les centres d'intérêt doivent faire au plus ${LIMITS.profileText} caractères.`),
    driveFolderUrl: optionalDriveUrl(
      body.driveFolderUrl,
      'Le lien du dossier doit être un lien Google Drive ou Google Docs en https (https://drive.google.com/…).'
    ),
    notes: optionalText(body.notes, LIMITS.notes, `Les notes doivent faire au plus ${LIMITS.notes} caractères.`),
    aiContext: optionalText(body.aiContext, LIMITS.aiContext, `Le contexte pour l'IA doit faire au plus ${LIMITS.aiContext} caractères.`),
  }
  if (Object.values(patch).every((v) => v === undefined)) fail('Aucune modification à enregistrer.')
  return patch
}

async function applyPatch(admin, user, patch) {
  const { id } = user
  const profile = {}
  if (patch.fullName !== undefined) profile.full_name = patch.fullName || null
  if (patch.level !== undefined) profile.level = patch.level
  if (patch.goals !== undefined) profile.goals = patch.goals || null
  if (patch.interests !== undefined) profile.interests = patch.interests || null
  if (patch.driveFolderUrl !== undefined) profile.drive_folder_url = patch.driveFolderUrl

  if (Object.keys(profile).length) {
    const { error } = await admin.from('profiles').update(profile).eq('id', id)
    if (error) throw error
  }

  // Only the columns sent are written: saving one never clears the other
  const notes = {}
  if (patch.notes !== undefined) notes.notes = patch.notes || null
  if (patch.aiContext !== undefined) notes.ai_context = patch.aiContext || null
  if (Object.keys(notes).length) {
    const { error } = await admin.from('student_notes').upsert({ student_id: id, ...notes }, { onConflict: 'student_id' })
    if (error) throw error
  }

  if (patch.fullName) {
    // Keep the auth display name in sync (best effort)
    const { error } = await admin.auth.admin.updateUserById(id, {
      user_metadata: { ...(user.user_metadata || {}), full_name: patch.fullName },
    })
    if (error) console.error('[api] teacher/students/[id] metadata:', error)
  }
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'PATCH'])) return
  if (!allowSameOrigin(req, res)) return
  if (!(await requireTeacher(req, res))) return
  const { id } = req.query
  if (!isUuid(id)) return res.status(404).json({ error: NOT_FOUND })

  try {
    const admin = createAdminClient()
    const user = await getAuthUser(admin, id)
    if (!isStudentUser(user)) return res.status(404).json({ error: NOT_FOUND })

    if (req.method === 'PATCH') {
      const patch = parsePatch(bodyOf(req))
      const { data: exists, error } = await admin.from('profiles').select('id').eq('id', user.id).maybeSingle()
      if (error) throw error
      if (!exists) return res.status(404).json({ error: NOT_FOUND })
      await applyPatch(admin, user, patch)
    }

    const result = await loadStudent(admin, user)
    if (!result) return res.status(404).json({ error: NOT_FOUND })
    return res.status(200).json(result)
  } catch (err) {
    return handleError(res, err, 'teacher/students/[id]', 'fr')
  }
}
