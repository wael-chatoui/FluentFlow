// POST /api/teacher/lessons/[id]/regenerate { transcript?, canva?, options? }
//      → 202 { lesson: { id, status: 'generating', error: null } }
// Claims the row (status 'generating') and runs the AI in the background. Imported
// lessons (source_kind 'import') regenerate from their stored document text, with
// `options` or the stored generation_options. The student keeps the previous version
// meanwhile, and keeps it if the regeneration fails. 409 { code: 'busy' } while another
// generation of this lesson started less than 5 minutes ago. `hidden` is unchanged.
import { allowMethods, requireTeacher } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { HttpError, fail, handleError } from '@/utils/api/errors'
import { allowSameOrigin, bodyOf, isUuid, parseGenerationOptions, validateSources } from '@/utils/api/validate'
import { resolveGenerationOptions } from '@/utils/ai/options'
import { startLessonGeneration } from '@/utils/ai/lessonPipeline'
import { STALE_GENERATION_MS, isStaleGeneration } from '@/utils/lesson/schema'

// maxDuration also bounds the background generation (Vercel waitUntil)
export const config = { maxDuration: 300, api: { bodyParser: { sizeLimit: '2mb' } } }

const NOT_FOUND = 'Leçon introuvable.'
const BUSY = 'Une génération est déjà en cours pour cette leçon. Réessaie dans quelques minutes.'
const NO_SOURCE_TEXT = 'Le texte du document importé est introuvable : réimporte le document.'

const busy = () => new HttpError(409, BUSY, 'busy')

// Columns to update besides the status: new sources (transcript lessons), new options
function sourceUpdate(lesson, body, newOptions) {
  const update = {}
  if (lesson.source_kind === 'import') {
    if (!String(lesson.source_text || '').trim()) fail(NO_SOURCE_TEXT)
  } else {
    // New sources replace the stored ones (length-checked); missing ones keep the stored text
    const stored = []
    if (body.transcript === undefined) stored.push('transcript')
    if (body.canva === undefined) stored.push('canva')
    Object.assign(
      update,
      validateSources(
        body.transcript !== undefined ? body.transcript : lesson.transcript,
        body.canva !== undefined ? body.canva : lesson.canva,
        { stored }
      )
    )
  }
  if (newOptions) update.generation_options = newOptions
  return update
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return
  if (!allowSameOrigin(req, res)) return
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
    if (lesson.status === 'generating' && !isStaleGeneration(lesson)) throw busy()

    // New options win; otherwise the ones stored with the lesson (import: defaults when none)
    const options = newOptions || resolveGenerationOptions(lesson.generation_options)
    const update = sourceUpdate(lesson, body, newOptions)

    // Claim the row atomically so two concurrent regenerations cannot both run
    const staleBefore = new Date(Date.now() - STALE_GENERATION_MS).toISOString()
    const { data: claimed, error: claimError } = await admin
      .from('lessons')
      .update({ status: 'generating', error: null, ...update })
      .eq('id', id)
      .or(`status.neq.generating,updated_at.lt."${staleBefore}"`)
      .select('*')
    if (claimError) throw claimError
    if (!claimed?.length) throw busy()

    // A title the teacher chose (differs from the previous AI title) is kept
    const teacherTitle = lesson.title && lesson.title !== lesson.content?.title ? lesson.title : null
    const summary = startLessonGeneration(admin, claimed[0], { title: teacherTitle, options })
    return res.status(202).json({ lesson: summary })
  } catch (err) {
    return handleError(res, err, 'teacher/lessons/[id]/regenerate', 'fr')
  }
}
