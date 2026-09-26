// POST /api/teacher/lessons/[id]/regenerate { transcript?, canva? } → { lesson: { id, status, error } }
// 409 while another generation of this lesson started less than 5 minutes ago.
import { allowMethods, requireTeacher } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { handleError } from '@/utils/api/errors'
import { bodyOf, isUuid } from '@/utils/api/validate'
import { runLessonGeneration, validateSources } from '@/utils/ai/lessonPipeline'

export const config = { maxDuration: 300, api: { bodyParser: { sizeLimit: '2mb' } } }

const STALE_AFTER_MS = 5 * 60 * 1000
const NOT_FOUND = 'Cours introuvable.'
const BUSY = 'Une génération est déjà en cours pour ce cours. Réessaie dans quelques minutes.'

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return
  if (!(await requireTeacher(req, res))) return
  const { id } = req.query
  if (!isUuid(id)) return res.status(404).json({ error: NOT_FOUND })

  try {
    const body = bodyOf(req)
    const admin = createAdminClient()

    const { data: lesson, error } = await admin
      .from('lessons')
      .select('id, student_id, title, lesson_date, status, updated_at, transcript, canva, content')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!lesson) return res.status(404).json({ error: NOT_FOUND })

    const staleBefore = new Date(Date.now() - STALE_AFTER_MS).toISOString()
    if (lesson.status === 'generating' && Date.parse(lesson.updated_at) > Date.parse(staleBefore)) {
      return res.status(409).json({ error: BUSY })
    }

    // New sources replace the stored ones; missing ones keep the stored text
    const sources = validateSources(
      body.transcript !== undefined ? body.transcript : lesson.transcript,
      body.canva !== undefined ? body.canva : lesson.canva
    )

    // Claim the row atomically so two concurrent regenerations cannot both run
    const { data: claimed, error: claimError } = await admin
      .from('lessons')
      .update({ status: 'generating', error: null, ...sources })
      .eq('id', id)
      .or(`status.neq.generating,updated_at.lt."${staleBefore}"`)
      .select('id, student_id, lesson_date, transcript, canva, content')
    if (claimError) throw claimError
    if (!claimed?.length) return res.status(409).json({ error: BUSY })

    // A title the teacher chose (differs from the previous AI title) is kept
    const teacherTitle = lesson.title && lesson.title !== lesson.content?.title ? lesson.title : null
    const result = await runLessonGeneration(admin, claimed[0], { title: teacherTitle })
    return res.status(200).json({ lesson: result })
  } catch (err) {
    return handleError(res, err, 'teacher/lessons/[id]/regenerate', 'fr')
  }
}
