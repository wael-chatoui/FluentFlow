// GET /api/admin/audit?action=&entity=&page=&perPage= → { entries, total, page, perPage } (newest first)
import { allowMethods, requireAdmin } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { handleError } from '@/utils/api/errors'
import { parsePagination, queryText } from '@/utils/api/admin/query'

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return
  if (!(await requireAdmin(req, res))) return

  try {
    const query = req.query || {}
    const action = queryText(query.action, 100)
    const entity = queryText(query.entity, 100)
    const { page, perPage, from, to } = parsePagination(query)

    let request = createAdminClient()
      .from('admin_audit_log')
      .select('id, admin_email, action, entity, entity_id, details, created_at', { count: 'exact' })
    if (action) request = request.eq('action', action)
    if (entity) request = request.eq('entity', entity)
    const { data, count, error } = await request
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .range(from, to)
    if (error) throw error

    return res.status(200).json({ entries: data || [], total: count || 0, page, perPage })
  } catch (err) {
    return handleError(res, err, 'admin/audit', 'fr')
  }
}
