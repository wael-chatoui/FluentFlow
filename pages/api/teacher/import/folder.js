// POST /api/teacher/import/folder { url, studentId? } → { folderId, folderName, files }
// Resolves a public Google Drive folder and returns the list of supported documents
// (Google Docs, PDF, text). Checks duplicate lessons in DB if studentId is provided.
import { allowMethods, normalizeUuid, requireTeacher } from '@/utils/auth/server'
import { allowSameOrigin, bodyOf, isUuid } from '@/utils/api/validate'
import { createAdminClient } from '@/utils/supabase/admin'
import { handleError } from '@/utils/api/errors'
import { sendImportError } from '@/utils/import/errors'
import { resolveGoogleFolder } from '@/utils/import/google'

export const config = { maxDuration: 60 }

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return
  if (!allowSameOrigin(req, res)) return
  if (!(await requireTeacher(req, res))) return

  try {
    const { url, studentId } = bodyOf(req)
    const result = await resolveGoogleFolder(url)

    // Optional database duplicate checking if a student is specified
    if (studentId && isUuid(studentId)) {
      const admin = createAdminClient()
      const { data: dbLessons } = await admin
        .from('lessons')
        .select('id, title, lesson_date, source_name')
        .eq('student_id', normalizeUuid(studentId))

      if (Array.isArray(dbLessons) && dbLessons.length > 0) {
        const bySourceName = new Map()
        dbLessons.forEach((l) => {
          if (l.source_name) {
            bySourceName.set(l.source_name.toLowerCase().trim(), {
              id: l.id,
              title: l.title || '',
              lesson_date: l.lesson_date,
              match: 'source',
            })
          }
        })

        result.files = result.files.map((file) => {
          const match = file.name ? bySourceName.get(file.name.toLowerCase().trim()) : null
          return match ? { ...file, existingLesson: match } : file
        })
      }
    }

    return res.status(200).json(result)
  } catch (err) {
    if (sendImportError(res, err)) {
      if (err.status >= 500 || err.cause) console.error('[api] teacher/import/folder:', err.cause || err)
      return
    }
    return handleError(res, err, 'teacher/import/folder', 'fr')
  }
}
