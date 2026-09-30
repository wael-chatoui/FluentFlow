// POST /api/teacher/lessons/[id]/regenerate { transcript?, canva?, options? } → { lesson: { id, status, error } }
// Imported lessons (source_kind 'import') regenerate from their stored document text,
// with `options` or the stored generation_options. 409 while another generation of
// this lesson started less than 5 minutes ago.
import { allowMethods, requireTeacher } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { fail, handleError } from '@/utils/api/errors'
import { bodyOf, isUuid, parseGenerationOptions } from '@/utils/api/validate'
import { runLessonGeneration, validateSources } from '@/utils/ai/lessonPipeline'
import { resolveGenerationOptions } from '@/utils/ai/prompt'

export const config = { maxDuration: 300, api: { bodyParser: { sizeLimit: '2mb' } } }

const STALE_AFTER_MS = 5 * 60 * 1000
const NOT_FOUND = 'Cours introuvable.'
const BUSY = 'Une génération est déjà en cours pour ce cours. Réessaie dans quelques minutes.'
const NO_SOURCE_TEXT = 'Le texte du document importé est introuvable : réimporte le document.'

// Columns to update besides the status (sources for transcript lessons, options)
function sourceUpdate(lesson, body, options) {
  // select('*') only returns the 0005 columns once the migration is applied
  const hasImportColumns = 'source_kind' in lesson
  const update = {}

  if (lesson.source_kind === 'import') {
    if (!String(lesson.source_text || '').trim()) fail(NO_SOURCE_TEXT)
  } else {
    // New sources replace the stored ones; missing ones keep the stored text
    Object.assign(
      update,
      validateSources(
        body.transcript !== undefined ? body.transcript : lesson.transcript,
        body.canva !== undefined ? body.canva : lesson.canva
      )
    )
  }

  if (options && hasImportColumns) update.generation_options = options
  return update
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return
  if (!(await requireTeacher(req, res))) return
  const { id } = req.query
  if (!isUuid(id)) return res.status(404).json({ error: NOT_FOUND })

  try {
    const body = bodyOf(req)
    const newOptions = parseGenerationOptions(body.options)
    const admin = createAdminClient()

    const { data: lesson, error } = await admin.from('lessons').select('*').eq('id', id).maybeSingle()
    if (error) throw error
    if (!lesson) return res.status(404).json({ error: NOT_FOUND })

    const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString()
    if (lesson.status === 'generating' && Date.parse(lesson.updated_at) > Date.parse(staleBefore)) {
      return res.status(409).json({ error: BUSY })
    }

    // New options win; otherwise the ones stored with the lesson (import: defaults when none)
    const options = newOptions || resolveGenerationOptions(lesson.generation_options)
    const update = sourceUpdate(lesson, body, newOptions)

    // Claim the row atomically so two concurrent regenerations cannot both run
    const { data: claimed, error: claimError } = await admin
      .from('lessons')
      .update({ status: 'generating', error: null, ...update })
      .eq('id', id)
      .or(`status.neq.generating,updated_at.lt."${staleBefore}"`)
      .select('*')
    if (claimError) throw claimError
    if (!claimed?.length) return res.status(409).json({ error: BUSY })

    // A title the teacher chose (differs from the previous AI title) is kept
    const teacherTitle = lesson.title && lesson.title !== lesson.content?.title ? lesson.title : null
    const result = await runLessonGeneration(admin, claimed[0], { title: teacherTitle, options })
    return res.status(200).json({ lesson: result })
  } catch (err) {
    return handleError(res, err, 'teacher/lessons/[id]/regenerate', 'fr')
  }
}
