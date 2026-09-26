// GET   /api/teacher/students/[id] → { student, notes, lessons }
// PATCH /api/teacher/students/[id] any of { fullName, level, goals, interests, driveFolderUrl, notes } → same shape
import { allowMethods, requireTeacher } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { fail, handleError } from '@/utils/api/errors'
import { LIMITS, bodyOf, isUuid, optionalDriveUrl, optionalLevel, optionalText } from '@/utils/api/validate'
import { isStudentAccount } from '@/utils/api/students'
import { exerciseCount, progressByLesson, progressOf } from '@/utils/api/progress'

const STUDENT_FIELDS = 'id, email, full_name, level, goals, interests, drive_folder_url, onboarded_at, created_at'
const NOT_FOUND = 'Élève introuvable.'

async function loadStudent(admin, id) {
  const [student, notes, lessons, sessions] = await Promise.all([
    admin.from('profiles').select(STUDENT_FIELDS).eq('id', id).maybeSingle(),
    admin.from('student_notes').select('notes').eq('student_id', id).maybeSingle(),
    admin
      .from('lessons')
      .select('id, title, lesson_date, status, error, exercises, created_at, updated_at')
      .eq('student_id', id)
      .order('lesson_date', { ascending: false })
      .order('created_at', { ascending: false }),
    admin.from('practice_sessions').select('lesson_id, score, total').eq('student_id', id),
  ])
  for (const r of [student, notes, lessons, sessions]) if (r.error) throw r.error
  if (!student.data) return null

  const progress = progressByLesson(sessions.data)
  return {
    student: student.data,
    notes: notes.data?.notes || '',
    lessons: (lessons.data || []).map((l) => ({
      id: l.id,
      title: l.title,
      lesson_date: l.lesson_date,
      status: l.status,
      error: l.error,
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
      'Le lien du dossier doit être un lien Google Drive en https (https://drive.google.com/…).'
    ),
    notes: optionalText(body.notes, LIMITS.notes, `Les notes doivent faire au plus ${LIMITS.notes} caractères.`),
  }
  if (Object.values(patch).every((v) => v === undefined)) fail('Aucune modification à enregistrer.')
  return patch
}

async function applyPatch(admin, id, patch) {
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
  if (patch.notes !== undefined) {
    const { error } = await admin
      .from('student_notes')
      .upsert({ student_id: id, notes: patch.notes || null }, { onConflict: 'student_id' })
    if (error) throw error
  }
  if (patch.fullName) {
    // Keep the auth display name in sync (best effort)
    const { data } = await admin.auth.admin.getUserById(id)
    if (data?.user) {
      const { error } = await admin.auth.admin.updateUserById(id, {
        user_metadata: { ...(data.user.user_metadata || {}), full_name: patch.fullName },
      })
      if (error) console.error('[api] teacher/students/[id] metadata:', error)
    }
  }
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'PATCH'])) return
  if (!(await requireTeacher(req, res))) return
  const { id } = req.query
  if (!isUuid(id)) return res.status(404).json({ error: NOT_FOUND })

  try {
    const admin = createAdminClient()
    if (!(await isStudentAccount(admin, id))) return res.status(404).json({ error: NOT_FOUND })

    if (req.method === 'PATCH') {
      const patch = parsePatch(bodyOf(req))
      const { data: exists, error } = await admin.from('profiles').select('id').eq('id', id).maybeSingle()
      if (error) throw error
      if (!exists) return res.status(404).json({ error: NOT_FOUND })
      await applyPatch(admin, id, patch)
    }

    const result = await loadStudent(admin, id)
    if (!result) return res.status(404).json({ error: NOT_FOUND })
    return res.status(200).json(result)
  } catch (err) {
    return handleError(res, err, 'teacher/students/[id]', 'fr')
  }
}
