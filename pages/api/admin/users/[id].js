// GET    /api/admin/users/[id] → { user, profile, notes, lessons, sessions, reviews }
// PATCH  /api/admin/users/[id] any of { role, isAdmin, fullName, level, goals, interests, driveFolderUrl, notes, resetOnboarding, banned } → same shape
// DELETE /api/admin/users/[id] { confirmEmail } → { success: true }
// An admin cannot change their own role, remove their own admin flag, ban or delete themselves.
import { allowMethods, getRole, isAdmin, requireAdmin } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { fail, handleError } from '@/utils/api/errors'
import { LIMITS, bodyOf, isUuid, optionalDriveUrl, optionalLevel, optionalText } from '@/utils/api/validate'
import { logAdminAction } from '@/utils/api/audit'
import { exerciseCount, progressByLesson, progressOf } from '@/utils/api/progress'
import { diffFields, selectAll } from '@/utils/api/admin/query'
import { authSummary, getAuthUser, isBanned } from '@/utils/api/admin/users'

const NOT_FOUND = 'Utilisateur introuvable.'
const PROFILE_FIELDS = 'id, email, full_name, level, goals, interests, drive_folder_url, onboarded_at, created_at, updated_at'
const RECENT = 50
const BAN_FOREVER = '876000h'

async function loadUser(admin, user) {
  const id = user.id
  const [profile, notes, lessons, progressRows, sessions, reviews] = await Promise.all([
    admin.from('profiles').select(PROFILE_FIELDS).eq('id', id).maybeSingle(),
    admin.from('student_notes').select('notes').eq('student_id', id).maybeSingle(),
    selectAll(() =>
      admin
        .from('lessons')
        .select('id, title, lesson_date, status, exercises, created_at')
        .eq('student_id', id)
        .order('lesson_date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id')
    ),
    selectAll(() => admin.from('practice_sessions').select('lesson_id, score, total').eq('student_id', id).order('id')),
    admin
      .from('practice_sessions')
      .select('id, lesson_id, score, total, completed_at')
      .eq('student_id', id)
      .order('completed_at', { ascending: false })
      .limit(RECENT),
    admin
      .from('review_attempts')
      .select('id, lesson_id, exercise_id, correct, created_at')
      .eq('student_id', id)
      .order('created_at', { ascending: false })
      .limit(RECENT),
  ])
  for (const r of [profile, notes, sessions, reviews]) if (r.error) throw r.error

  const progress = progressByLesson(progressRows)
  const titles = new Map(lessons.map((l) => [l.id, l.title]))
  return {
    user: authSummary(user),
    profile: profile.data || null,
    notes: notes.data?.notes || '',
    lessons: lessons.map((l) => ({
      id: l.id,
      title: l.title,
      lesson_date: l.lesson_date,
      status: l.status,
      exercise_count: exerciseCount(l.exercises),
      ...progressOf(progress, l.id),
    })),
    sessions: (sessions.data || []).map((s) => ({
      id: s.id,
      lesson_id: s.lesson_id,
      lesson_title: titles.get(s.lesson_id) ?? null,
      score: s.score,
      total: s.total,
      completed_at: s.completed_at,
    })),
    reviews: reviews.data || [],
  }
}

function parsePatch(body, { self }) {
  const patch = {
    role: body.role,
    isAdmin: body.isAdmin,
    banned: body.banned,
    resetOnboarding: body.resetOnboarding,
    // Same rules and messages as PATCH /api/teacher/students/[id]
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
  if (patch.role !== undefined && !['student', 'teacher'].includes(patch.role)) fail('Rôle invalide (student ou teacher).')
  if (patch.isAdmin !== undefined && typeof patch.isAdmin !== 'boolean') fail('isAdmin doit être un booléen.')
  if (patch.banned !== undefined && typeof patch.banned !== 'boolean') fail('banned doit être un booléen.')
  if (patch.resetOnboarding !== undefined && typeof patch.resetOnboarding !== 'boolean') {
    fail('resetOnboarding doit être un booléen.')
  }
  if (patch.resetOnboarding === false) patch.resetOnboarding = undefined
  if (Object.values(patch).every((v) => v === undefined)) fail('Aucune modification à enregistrer.')

  if (self.id) {
    if (patch.role !== undefined && patch.role !== self.role) fail('Tu ne peux pas modifier ton propre rôle.')
    if (patch.isAdmin === false) fail('Tu ne peux pas retirer ton propre accès administrateur.')
    if (patch.banned === true) fail('Tu ne peux pas bloquer ton propre compte.')
  }
  return patch
}

async function applyPatch(admin, user, patch) {
  const id = user.id
  const details = {}

  // Auth: role / admin flag / ban / display name, in one call
  const authUpdate = {}
  const appMeta = { ...(user.app_metadata || {}) }
  let appChanged = false
  if (patch.role !== undefined && patch.role !== getRole(user)) {
    details.role = { from: getRole(user), to: patch.role }
    appMeta.role = patch.role
    appChanged = true
  }
  if (patch.isAdmin !== undefined && patch.isAdmin !== isAdmin(user)) {
    details.is_admin = { from: isAdmin(user), to: patch.isAdmin }
    appMeta.is_admin = patch.isAdmin
    appChanged = true
  }
  if (appChanged) authUpdate.app_metadata = appMeta
  if (patch.banned !== undefined && patch.banned !== isBanned(user)) {
    details.banned = { from: isBanned(user), to: patch.banned }
    authUpdate.ban_duration = patch.banned ? BAN_FOREVER : 'none'
  }
  if (patch.fullName && patch.fullName !== user.user_metadata?.full_name) {
    authUpdate.user_metadata = { ...(user.user_metadata || {}), full_name: patch.fullName }
  }

  // Profile fields (row normally created by the DB trigger; upsert in case it is missing)
  const profileUpdate = {}
  if (patch.fullName !== undefined) profileUpdate.full_name = patch.fullName || null
  if (patch.level !== undefined) profileUpdate.level = patch.level
  if (patch.goals !== undefined) profileUpdate.goals = patch.goals || null
  if (patch.interests !== undefined) profileUpdate.interests = patch.interests || null
  if (patch.driveFolderUrl !== undefined) profileUpdate.drive_folder_url = patch.driveFolderUrl
  if (patch.resetOnboarding) profileUpdate.onboarded_at = null

  let before = null
  if (Object.keys(profileUpdate).length) {
    const { data, error } = await admin.from('profiles').select(PROFILE_FIELDS).eq('id', id).maybeSingle()
    if (error) throw error
    before = data
  }
  let notesBefore = null
  if (patch.notes !== undefined) {
    const { data, error } = await admin.from('student_notes').select('notes').eq('student_id', id).maybeSingle()
    if (error) throw error
    notesBefore = data?.notes || null
  }

  if (Object.keys(authUpdate).length) {
    const { error } = await admin.auth.admin.updateUserById(id, authUpdate)
    if (error) throw error
  }
  if (Object.keys(profileUpdate).length) {
    const { error } = before
      ? await admin.from('profiles').update(profileUpdate).eq('id', id)
      : await admin.from('profiles').upsert({ id, email: user.email || null, ...profileUpdate }, { onConflict: 'id' })
    if (error) throw error
    Object.assign(details, diffFields(before, profileUpdate, { summaryOnly: ['goals', 'interests'] }))
  }
  if (patch.notes !== undefined && (patch.notes || null) !== notesBefore) {
    const { error } = await admin
      .from('student_notes')
      .upsert({ student_id: id, notes: patch.notes || null }, { onConflict: 'student_id' })
    if (error) throw error
    details.notes = { changed: true, length: patch.notes.length }
  }
  return details
}

function confirmEmailOf(req) {
  const body = bodyOf(req)
  const value = body.confirmEmail !== undefined ? body.confirmEmail : req.query?.confirmEmail
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'PATCH', 'DELETE'])) return
  const auth = await requireAdmin(req, res)
  if (!auth) return
  const { id } = req.query
  if (!isUuid(id)) return res.status(404).json({ error: NOT_FOUND })
  const isSelf = id === auth.user.id

  try {
    const admin = createAdminClient()

    if (req.method === 'DELETE') {
      if (isSelf) fail('Tu ne peux pas supprimer ton propre compte.')
      const user = await getAuthUser(admin, id)
      if (!user) return res.status(404).json({ error: NOT_FOUND })
      const confirm = confirmEmailOf(req)
      if (!confirm || confirm !== (user.email || '').toLowerCase()) {
        fail("L'adresse e-mail de confirmation ne correspond pas à ce compte.")
      }
      const { error } = await admin.auth.admin.deleteUser(id)
      if (error) throw error
      await logAdminAction(admin, auth.user, {
        action: 'user.delete',
        entity: 'user',
        entityId: id,
        details: { email: user.email || null, role: getRole(user), is_admin: isAdmin(user) },
      })
      return res.status(200).json({ success: true })
    }

    let user = await getAuthUser(admin, id)
    if (!user) return res.status(404).json({ error: NOT_FOUND })

    if (req.method === 'PATCH') {
      const patch = parsePatch(bodyOf(req), { self: isSelf ? { id, role: getRole(user) } : {} })
      const changes = await applyPatch(admin, user, patch)
      if (Object.keys(changes).length) {
        await logAdminAction(admin, auth.user, {
          action: 'user.update',
          entity: 'user',
          entityId: id,
          details: { email: user.email || null, changes },
        })
      }
      user = (await getAuthUser(admin, id)) || user
    }

    return res.status(200).json(await loadUser(admin, user))
  } catch (err) {
    return handleError(res, err, `admin/users/[id] ${req.method}`, 'fr')
  }
}
