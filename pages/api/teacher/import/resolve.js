// POST /api/teacher/import/resolve { url } → { sourceName, text, pages, warning }
// Public Google Docs link (plain-text export) or Drive file link (PDF or text). The
// server rebuilds the download URL from the document id (never fetches the pasted
// URL itself) and only follows redirects to Google hosts (utils/import/google.js).
import { allowMethods, requireTeacher } from '@/utils/auth/server'
import { handleError } from '@/utils/api/errors'
import { bodyOf } from '@/utils/api/validate'
import { sendImportError } from '@/utils/import/errors'
import { resolveGoogleLink } from '@/utils/import/google'

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return
  if (!(await requireTeacher(req, res))) return

  try {
    const { url } = bodyOf(req)
    const result = await resolveGoogleLink(url)
    return res.status(200).json(result)
  } catch (err) {
    if (sendImportError(res, err)) {
      if (err.status >= 500 || err.cause) console.error('[api] teacher/import/resolve:', err.cause || err)
      return
    }
    return handleError(res, err, 'teacher/import/resolve', 'fr')
  }
}
