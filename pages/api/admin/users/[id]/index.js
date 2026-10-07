// GET    /api/admin/users/[id] → { user, profile, notes, ai_context, lessons, sessions, reviews }
// PATCH  /api/admin/users/[id] any of { role, isAdmin, fullName, level, goals, interests, driveFolderUrl,
//        notes, aiContext, resetOnboarding, banned } → same shape as GET
// DELETE /api/admin/users/[id] { confirmEmail } → { success: true }
// An admin cannot change their own role, remove their own admin flag, ban or delete
// themselves, and nobody can remove the last active admin or the last active teacher.
import { allowMethods, getRole, isAdmin, isBanned, normalizeUuid, requireAdmin } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { PROFILE_FIELDS } from '@/utils/supabase/profiles'
import { fail, handleError } from '@/utils/api/errors'
import { LIMITS, bodyOf, isUuid, optionalDriveUrl, optionalLevel, optionalText } from '@/utils/api/validate'
import { logAdminAction } from '@/utils/api/audit'
import { exerciseCount, progressByLesson, progressOf } from '@/utils/api/progress'
import { diffFields, selectAll } from '@/utils/api/admin/query'
import { assertJsonBody } from '@/utils/api/admin/guard'
import { assertPrivilegesRemain, authSummary, getAuthUser, listAllAuthUsers, losesPrivileges } from '@/utils/api/admin/users'

const NOT_FOUND = 'Utilisateur introuvable.'
const RECENT = 50
const BAN_FOREVER = '876000h'

async function loadUser(admin, user) {
  const id = user.id
  const [profile, notes, lessons, progressRows, sessions, reviews] = await Promise.all([
    admin.from('profiles').select(PROFILE_FIELDS).eq('id', id).maybeSingle(),
    admin.from('student_notes').select('notes, ai_context').eq('student_id', id).maybeSingle(),
    selectAll(() =>
      admin
        .from('lessons')
        .select('id, title, lesson_date, status, hidden, exercises, generated_at, created_at')
        .eq('student_id', id)
        .order('lesson_date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id')
    ),
    selectAll(() => admin.from('practice_sessions').select('lesson_id, score, total, completed_at').eq('student_id', id).order('id')),
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

  // Progress of the current version of each lesson (like the student sees it)
  const progress = progressByLesson(progressRows, lessons)
  const titles = new Map(lessons.map((l) => [l.id, l.title]))
  // Results on lessons that are not (or no longer) this student's: look the titles up by id
  const otherIds = [...new Set([...(sessions.data || []), ...(reviews.data || [])].map((r) => r.lesson_id))].filter(
    (lessonId) => lessonId && !titles.has(lessonId)
  )
  if (otherIds.length) {
    const { data, error } = await admin.from('lessons').select('id, title').in('id', otherIds)
    if (error) throw error
    for (const l of data || []) titles.set(l.id, l.title)
  }

  let subscription = null
  try {
    const { data: subData } = await admin
      .from('subscriptions')
      .select('id, provider, customer_id, subscription_id, plan, status, amount_cents, currency, current_period_start, current_period_end, cancel_at_period_end, created_at')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    subscription = subData || null
  } catch {}

  let aiSummary = { total_cost_usd: 0, calls: 0, total_tokens: 0 }
  try {
    const { data: aiData } = await admin
      .from('ai_generations')
      .select('cost_usd, prompt_tokens, completion_tokens')
      .eq('student_id', id)
    if (aiData && aiData.length) {
      let cost = 0
      let totalTokens = 0
      for (const g of aiData) {
        const p = Number(g.prompt_tokens) || 0
        const c = Number(g.completion_tokens) || 0
        totalTokens += p + c
        if (g.cost_usd !== null && g.cost_usd !== undefined) cost += Number(g.cost_usd)
        else cost += (p * 0.05 + c * 0.4) / 1e6
      }
      aiSummary = {
        total_cost_usd: Math.round(cost * 1_000_000) / 1_000_000,
        calls: aiData.length,
        total_tokens: totalTokens,
      }
    }
  } catch {}

  return {
    user: authSummary(user),
    profile: profile.data || null,
    notes: notes.data?.notes || '',
    ai_context: notes.data?.ai_context || '',
    subscription,
    ai_summary: aiSummary,
    lessons: lessons.map((l) => ({
      id: l.id,
      title: l.title,
      lesson_date: l.lesson_date,
      status: l.status,
      hidden: Boolean(l.hidden),
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
    reviews: (reviews.data || []).map((r) => ({ ...r, lesson_title: titles.get(r.lesson_id) ?? null })),
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
    aiContext: optionalText(body.aiContext, LIMITS.aiContext, `Le contexte pour l'IA doit faire au plus ${LIMITS.aiContext} caractères.`),
  }
  if (patch.role !== undefined && !['student', 'teacher'].includes(patch.role)) fail('Rôle invalide (student ou teacher).')
  if (patch.isAdmin !== undefined && typeof patch.isAdmin !== 'boolean') fail('isAdmin doit être un booléen.')
  if (patch.banned !== undefined && typeof patch.banned !== 'boolean') fail('banned doit être un booléen.')
  if (patch.resetOnboarding !== undefined && typeof patch.resetOnboarding !== 'boolean') {
    fail('resetOnboarding doit être un booléen.')
  }
  if (patch.resetOnboarding === false) patch.resetOnboarding = undefined
  if (Object.values(patch).every((v) => v === undefined)) fail('Aucune modification à enregistrer.')

  if (self) {
    if (patch.role !== undefined && patch.role !== self.role) fail('Tu ne peux pas modifier ton propre rôle.')
    if (patch.isAdmin === false) fail('Tu ne peux pas retirer ton propre accès administrateur.')
    if (patch.banned === true) fail('Tu ne peux pas bloquer ton propre compte.')
  }
  return patch
}

/**
 * Applies the patch step by step (auth, profile, notes) and records each applied
 * change in `changes`, so a failure half-way still leaves an accurate audit entry.
 */
async function applyPatch(admin, user, patch, changes) {
  const id = user.id

  // Auth: role / admin flag / ban / display name, in one call
  const authUpdate = {}
  const authChanges = {}
  const appMeta = { ...(user.app_metadata || {}) }
  let appChanged = false
  if (patch.role !== undefined && patch.role !== getRole(user)) {
    authChanges.role = { from: getRole(user), to: patch.role }
    appMeta.role = patch.role
    appChanged = true
  }
  if (patch.isAdmin !== undefined && patch.isAdmin !== isAdmin(user)) {
    authChanges.is_admin = { from: isAdmin(user), to: patch.isAdmin }
    appMeta.is_admin = patch.isAdmin
    appChanged = true
  }
  if (appChanged) authUpdate.app_metadata = appMeta
  if (patch.banned !== undefined && patch.banned !== isBanned(user)) {
    authChanges.banned = { from: isBanned(user), to: patch.banned }
    authUpdate.ban_duration = patch.banned ? BAN_FOREVER : 'none'
  }
  // The sign-up name stays in sync (also when cleared), so no list shows a stale one
  const metaName = user.user_metadata?.full_name || null
  if (patch.fullName !== undefined && (patch.fullName || null) !== metaName) {
    authUpdate.user_metadata = { ...(user.user_metadata || {}), full_name: patch.fullName || null }
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
  const notesUpdate = {}
  if (patch.notes !== undefined || patch.aiContext !== undefined) {
    const { data, error } = await admin.from('student_notes').select('notes, ai_context').eq('student_id', id).maybeSingle()
    if (error) throw error
    if (patch.notes !== undefined && (patch.notes || null) !== (data?.notes || null)) notesUpdate.notes = patch.notes || null
    if (patch.aiContext !== undefined && (patch.aiContext || null) !== (data?.ai_context || null)) {
      notesUpdate.ai_context = patch.aiContext || null
    }
  }

  if (Object.keys(authUpdate).length) {
    const { error } = await admin.auth.admin.updateUserById(id, authUpdate)
    if (error) throw error
    Object.assign(changes, authChanges)
  }
  if (Object.keys(profileUpdate).length) {
    const { error } = before
      ? await admin.from('profiles').update(profileUpdate).eq('id', id)
      : await admin.from('profiles').upsert({ id, email: user.email || null, ...profileUpdate }, { onConflict: 'id' })
    if (error) throw error
    Object.assign(changes, diffFields(before, profileUpdate, { summaryOnly: ['goals', 'interests'] }))
  }
  if (Object.keys(notesUpdate).length) {
    const { error } = await admin.from('student_notes').upsert({ student_id: id, ...notesUpdate }, { onConflict: 'student_id' })
    if (error) throw error
    // Private text: only that it changed and its length
    for (const [key, value] of Object.entries(notesUpdate)) changes[key] = { changed: true, length: value?.length || 0 }
  }
}

// The account after the change, for the last admin / last teacher rule
function nextState(user, patch) {
  return {
    role: patch.role ?? getRole(user),
    isAdmin: patch.isAdmin ?? isAdmin(user),
    active: patch.banned === undefined ? !isBanned(user) : !patch.banned,
  }
}

async function guardPrivileges(admin, user, next) {
  if (losesPrivileges(user, next)) assertPrivilegesRemain(await listAllAuthUsers(admin), user, next)
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'PATCH', 'DELETE'])) return
  const auth = await requireAdmin(req, res)
  if (!auth) return
  if (!isUuid(req.query.id)) return res.status(404).json({ error: NOT_FOUND })
  // Canonical ids: an upper-case id must not slip past the self-protection rules
  const id = normalizeUuid(req.query.id)
  const isSelf = id === normalizeUuid(auth.user.id)

  try {
    assertJsonBody(req)
    const admin = createAdminClient()

    if (req.method === 'DELETE') {
      if (isSelf) fail('Tu ne peux pas supprimer ton propre compte.')
      const user = await getAuthUser(admin, id)
      if (!user) return res.status(404).json({ error: NOT_FOUND })
      const body = bodyOf(req)
      const confirm = typeof body.confirmEmail === 'string' ? body.confirmEmail.trim().toLowerCase() : ''
      if (!confirm || confirm !== (user.email || '').toLowerCase()) {
        fail("L'adresse e-mail de confirmation ne correspond pas à ce compte.")
      }
      await guardPrivileges(admin, user, { role: getRole(user), isAdmin: isAdmin(user), active: false })
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
      const patch = parsePatch(bodyOf(req), { self: isSelf ? { role: getRole(user) } : null })
      await guardPrivileges(admin, user, nextState(user, patch))
      const changes = {}
      let failed = true
      try {
        await applyPatch(admin, user, patch, changes)
        failed = false
      } finally {
        // Also when a later step failed: an applied role / admin / ban change is always audited
        if (Object.keys(changes).length) {
          await logAdminAction(admin, auth.user, {
            action: 'user.update',
            entity: 'user',
            entityId: id,
            details: { email: user.email || null, changes, ...(failed ? { incomplete: true } : {}) },
          })
        }
      }
      user = (await getAuthUser(admin, id)) || user
    }

    return res.status(200).json(await loadUser(admin, user))
  } catch (err) {
    return handleError(res, err, `admin/users/[id] ${req.method}`, 'fr')
  }
}
