// GET /api/admin/lessons?q=&status=&studentId=&page=&perPage= → { lessons, total, page, perPage } (newest first)
import { allowMethods, requireAdmin } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { fail, handleError } from '@/utils/api/errors'
import { isUuid } from '@/utils/api/validate'
import { exerciseCount } from '@/utils/api/progress'
import { escapeLike, parsePagination, queryEnum, queryText } from '@/utils/api/admin/query'

const STATUSES = ['generating', 'published', 'failed']

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return
  if (!(await requireAdmin(req, res))) return

  try {
    const query = req.query || {}
    const q = queryText(query.q)
    const status = queryEnum(query.status, STATUSES, '', 'Statut invalide.')
    const studentId = queryText(query.studentId, 64)
    if (studentId && !isUuid(studentId)) fail('Identifiant élève invalide.')
    const { page, perPage, from, to } = parsePagination(query)

    const admin = createAdminClient()
    let request = admin
      .from('lessons')
      .select('id, title, lesson_date, status, student_id, exercises, ai_model, created_at, updated_at', { count: 'exact' })
    if (q) request = request.ilike('title', `%${escapeLike(q)}%`)
    if (status) request = request.eq('status', status)
    if (studentId) request = request.eq('student_id', studentId)
    const { data, count, error } = await request
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)
    if (error) throw error

    const rows = data || []
    const studentIds = [...new Set(rows.map((l) => l.student_id).filter(Boolean))]
    const names = new Map()
    if (studentIds.length) {
      const { data: profiles, error: profileError } = await admin
        .from('profiles')
        .select('id, full_name, email')
        .in('id', studentIds)
      if (profileError) throw profileError
      for (const p of profiles || []) names.set(p.id, p.full_name || p.email || '')
    }

    return res.status(200).json({
      lessons: rows.map((l) => ({
        id: l.id,
        title: l.title,
        lesson_date: l.lesson_date,
        status: l.status,
        student_id: l.student_id,
        student_name: names.get(l.student_id) || '',
        exercise_count: exerciseCount(l.exercises),
        ai_model: l.ai_model,
        created_at: l.created_at,
        updated_at: l.updated_at,
      })),
      total: count || 0,
      page,
      perPage,
    })
  } catch (err) {
    return handleError(res, err, 'admin/lessons GET', 'fr')
  }
}
