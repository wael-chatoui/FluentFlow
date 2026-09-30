// GET /api/admin/tables → { tables: [{ name, label, count, unavailable? }] } (read-only explorer, registry in
// utils/api/admin/tables.js; unavailable = 'missing' | 'forbidden' for a 0006 table, count null)
import { allowMethods, requireAdmin } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { handleError } from '@/utils/api/errors'
import { listTables } from '@/utils/api/admin/tables'

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return
  if (!(await requireAdmin(req, res))) return

  try {
    const tables = await listTables(createAdminClient())
    return res.status(200).json({ tables })
  } catch (err) {
    return handleError(res, err, 'admin/tables', 'fr')
  }
}
