// GET /api/admin/audit?action=&entity=&entityId=&page=&perPage= → { entries, total, page, perPage }
// Newest first. A page past the end returns the last page.
import { allowMethods, requireAdmin } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { handleError } from '@/utils/api/errors'
import { parsePagination, queryText, selectPage } from '@/utils/api/admin/query'

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return
  if (!(await requireAdmin(req, res))) return

  try {
    const query = req.query || {}
    const action = queryText(query.action, 100)
    const entity = queryText(query.entity, 100)
    // entity_id is text (a uuid for users and lessons): compared as given, case-insensitively for uuids
    const entityId = queryText(query.entityId, 100).toLowerCase()
    const { page, perPage } = parsePagination(query)

    const admin = createAdminClient()
    const result = await selectPage(
      (options) => {
        let request = admin
          .from('admin_audit_log')
          .select('id, admin_email, action, entity, entity_id, details, created_at', options)
        if (action) request = request.eq('action', action)
        if (entity) request = request.eq('entity', entity)
        if (entityId) request = request.eq('entity_id', entityId)
        return request.order('created_at', { ascending: false }).order('id', { ascending: false })
      },
      { page, perPage }
    )

    return res.status(200).json({ entries: result.rows, total: result.total, page: result.page, perPage })
  } catch (err) {
    return handleError(res, err, 'admin/audit', 'fr')
  }
}
