// GET /api/admin/tables/[table]?q=&sort=&dir=asc|desc&page=&perPage= → { table, label, columns, rows, total, page, perPage }
// Only registered tables/columns are queried; long text/json values are cut to 500 chars.
import { allowMethods, requireAdmin } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { handleError } from '@/utils/api/errors'
import { readTablePage, tableSpec } from '@/utils/api/admin/tables'

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return
  if (!(await requireAdmin(req, res))) return
  const { table } = req.query
  if (!tableSpec(table)) return res.status(404).json({ error: 'Table inconnue.' })

  try {
    const result = await readTablePage(createAdminClient(), table, req.query)
    return res.status(200).json(result)
  } catch (err) {
    return handleError(res, err, `admin/tables/${table}`, 'fr')
  }
}
