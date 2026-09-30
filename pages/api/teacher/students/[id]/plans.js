// GET  /api/teacher/students/[id]/plans → { plans: [{ id, focus, content, created_at }] } (latest 10)
// POST /api/teacher/students/[id]/plans { focus?: string ≤ 1000, lessonId?: uuid }
//      → 201 { plan: { id|null, focus, content, created_at } }
// « Préparer le prochain cours »: the AI writes a tutor plan from the profile, the AI
// context and the last 3 lesson recaps (with lessonId: the class right after that
// lesson). No lesson yet → trial-lesson plan. Synchronous (about 90 s at most).
// Stored in lesson_plans; before migration 0006 the plan is returned with id null.
import { allowMethods, requireTeacher } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { HttpError, fail, handleError } from '@/utils/api/errors'
import { LIMITS, allowSameOrigin, bodyOf, isUuid, optionalText } from '@/utils/api/validate'
import { getAuthUser, isStudentUser } from '@/utils/api/students'
import { AiError } from '@/utils/ai/client'
import { isMissingTable, recordGeneration } from '@/utils/ai/ledger'
import { generatePlan } from '@/utils/ai/plan'

export const config = { maxDuration: 300 }

const NOT_FOUND = 'Élève introuvable.'
const LESSON_NOT_FOUND = 'Leçon introuvable pour cet élève.'
const PLAN_ERROR = 'La préparation du cours a échoué. Réessaie dans un instant.'
const MAX_PLANS = 10
const RECAPS = 3
const RECAP_FIELDS = 'id, title, lesson_date, content'

function parse(body) {
  const focus = optionalText(body.focus, LIMITS.planFocus, `La consigne doit faire au plus ${LIMITS.planFocus} caractères.`) || ''
  if (body.lessonId !== undefined && body.lessonId !== null && !isUuid(body.lessonId)) fail('Leçon invalide.')
  return { focus, lessonId: body.lessonId ? body.lessonId.toLowerCase() : null }
}

// Lessons whose recap feeds the plan, most recent first (any lesson with content,
// drafts included: the class took place)
async function loadRecaps(admin, studentId, lessonId) {
  const withContent = () =>
    admin
      .from('lessons')
      .select(RECAP_FIELDS)
      .eq('student_id', studentId)
      .not('content', 'is', null)
      .order('lesson_date', { ascending: false })
      .order('created_at', { ascending: false })

  if (!lessonId) {
    const { data, error } = await withContent().limit(RECAPS)
    if (error) throw error
    return data || []
  }

  const { data: anchor, error } = await admin
    .from('lessons')
    .select(RECAP_FIELDS)
    .eq('id', lessonId)
    .eq('student_id', studentId)
    .not('content', 'is', null)
    .maybeSingle()
  if (error) throw error
  if (!anchor) throw new HttpError(404, LESSON_NOT_FOUND)
  const { data: older, error: olderError } = await withContent()
    .neq('id', anchor.id)
    .lte('lesson_date', anchor.lesson_date)
    .limit(RECAPS - 1)
  if (olderError) throw olderError
  return [anchor, ...(older || [])]
}

async function listPlans(admin, studentId) {
  const { data, error } = await admin
    .from('lesson_plans')
    .select('id, focus, content, created_at')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false })
    .limit(MAX_PLANS)
  if (error && isMissingTable(error)) return []
  if (error) throw error
  return data || []
}

async function savePlan(admin, row) {
  const { data, error } = await admin.from('lesson_plans').insert(row).select('id, created_at').single()
  if (error && isMissingTable(error)) return { id: null, created_at: new Date().toISOString() }
  if (error) throw error
  return data
}

async function createPlan(admin, studentId, { focus, lessonId }) {
  const [profile, notes, recaps] = await Promise.all([
    admin.from('profiles').select('full_name, level, goals, interests').eq('id', studentId).maybeSingle(),
    admin.from('student_notes').select('ai_context').eq('student_id', studentId).maybeSingle(),
    loadRecaps(admin, studentId, lessonId),
  ])
  for (const r of [profile, notes]) if (r.error) throw r.error
  if (!profile.data) throw new HttpError(404, NOT_FOUND)

  const started = Date.now()
  let generated
  try {
    generated = await generatePlan({ profile: profile.data, aiContext: notes.data?.ai_context || '', recaps, focus })
  } catch (err) {
    const message = err instanceof AiError ? err.message : PLAN_ERROR
    await recordGeneration(admin, {
      kind: 'plan',
      lessonId,
      studentId,
      model: err?.model || null,
      ok: false,
      error: message,
      usage: err?.usage || null,
      durationMs: Date.now() - started,
    })
    if (err instanceof AiError) throw new HttpError(502, message, 'ai_failed')
    throw err
  }
  await recordGeneration(admin, {
    kind: 'plan',
    lessonId,
    studentId,
    model: generated.model,
    ok: true,
    usage: generated.usage,
    durationMs: Date.now() - started,
  })

  const saved = await savePlan(admin, { student_id: studentId, focus: focus || null, content: generated.content, ai_model: generated.model })
  return { id: saved.id, focus: focus || null, content: generated.content, created_at: saved.created_at }
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET', 'POST'])) return
  if (!allowSameOrigin(req, res)) return
  if (!(await requireTeacher(req, res))) return
  const { id } = req.query
  if (!isUuid(id)) return res.status(404).json({ error: NOT_FOUND })

  try {
    const input = req.method === 'POST' ? parse(bodyOf(req)) : null
    const admin = createAdminClient()
    const user = await getAuthUser(admin, id)
    if (!isStudentUser(user)) return res.status(404).json({ error: NOT_FOUND })

    if (input) return res.status(201).json({ plan: await createPlan(admin, user.id, input) })
    return res.status(200).json({ plans: await listPlans(admin, user.id) })
  } catch (err) {
    return handleError(res, err, `teacher/students/[id]/plans ${req.method}`, 'fr')
  }
}
