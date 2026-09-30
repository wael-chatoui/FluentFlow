// GET /api/admin/lessons?q=&status=&studentId=&page=&perPage= → { lessons, total, page, perPage } (newest first)
// q matches the title or the student's name / email. A page past the end returns the last page.
import { allowMethods, normalizeUuid, requireAdmin } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { fail, handleError } from '@/utils/api/errors'
import { isUuid } from '@/utils/api/validate'
import { exerciseCount } from '@/utils/api/progress'
import { ilikeAny, parsePagination, queryEnum, queryText, selectPage } from '@/utils/api/admin/query'

const STATUSES = ['generating', 'published', 'failed']
const MAX_STUDENT_MATCHES = 100

// Students whose name or email matches q (their lessons match the search too)
async function matchingStudentIds(admin, q) {
  const { data, error } = await admin
    .from('profiles')
    .select('id')
    .or(ilikeAny(['full_name', 'email'], q))
    .order('id')
    .limit(MAX_STUDENT_MATCHES)
  if (error) throw error
  return (data || []).map((p) => p.id)
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return
  if (!(await requireAdmin(req, res))) return

  try {
    const query = req.query || {}
    const q = queryText(query.q)
    const status = queryEnum(query.status, STATUSES, '', 'Statut invalide.')
    const studentId = queryText(query.studentId, 64)
    if (studentId && !isUuid(studentId)) fail('Identifiant élève invalide.')
    const { page, perPage } = parsePagination(query)

    const admin = createAdminClient()
    let search = ''
    if (q) {
      const ids = await matchingStudentIds(admin, q)
      search = [ilikeAny(['title'], q), ids.length ? `student_id.in.(${ids.join(',')})` : ''].filter(Boolean).join(',')
    }

    const result = await selectPage(
      (options) => {
        let request = admin
          .from('lessons')
          .select('id, title, lesson_date, status, hidden, student_id, exercises, ai_model, created_at, updated_at', options)
        if (search) request = request.or(search)
        if (status) request = request.eq('status', status)
        if (studentId) request = request.eq('student_id', normalizeUuid(studentId))
        return request.order('created_at', { ascending: false }).order('id', { ascending: false })
      },
      { page, perPage }
    )

    const studentIds = [...new Set(result.rows.map((l) => l.student_id).filter(Boolean))]
    const names = new Map()
    if (studentIds.length) {
      const { data: profiles, error } = await admin.from('profiles').select('id, full_name, email').in('id', studentIds)
      if (error) throw error
      for (const p of profiles || []) names.set(p.id, p.full_name || p.email || '')
    }

    return res.status(200).json({
      lessons: result.rows.map((l) => ({
        id: l.id,
        title: l.title,
        lesson_date: l.lesson_date,
        status: l.status,
        hidden: Boolean(l.hidden),
        student_id: l.student_id,
        student_name: names.get(l.student_id) || '',
        exercise_count: exerciseCount(l.exercises),
        ai_model: l.ai_model,
        created_at: l.created_at,
        updated_at: l.updated_at,
      })),
      total: result.total,
      page: result.page,
      perPage,
    })
  } catch (err) {
    return handleError(res, err, 'admin/lessons GET', 'fr')
  }
}
