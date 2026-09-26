// POST /api/teacher/lessons/import { studentId, lessonDate, title?, sourceName, text, options }
// → 201 { lesson: { id, status, error } }
// One imported document (PDF / Google Doc text) = one lesson. Same flow as
// POST /api/teacher/lessons: row created in 'generating', AI runs synchronously.
import { allowMethods, requireTeacher } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { fail, handleError } from '@/utils/api/errors'
import { LIMITS, bodyOf, isIsoDate, isUuid, optionalText, parseGenerationOptions } from '@/utils/api/validate'
import {
  MIGRATION_0005_MESSAGE,
  isExistingStudent,
  isMissingImportColumns,
  runLessonGeneration,
  validateImportText,
} from '@/utils/ai/lessonPipeline'
import { DEFAULT_GENERATION_OPTIONS } from '@/utils/ai/prompt'

export const config = { maxDuration: 300, api: { bodyParser: { sizeLimit: '1mb' } } }

const MAX_SOURCE_NAME = 200

function parse(body) {
  if (!isUuid(body.studentId)) fail('Élève invalide.')
  if (!isIsoDate(body.lessonDate)) fail('Date du cours invalide (format AAAA-MM-JJ).')
  const title = optionalText(body.title, LIMITS.title, `Le titre doit faire au plus ${LIMITS.title} caractères.`)
  const sourceName = optionalText(
    body.sourceName,
    MAX_SOURCE_NAME,
    `Le nom du document doit faire au plus ${MAX_SOURCE_NAME} caractères.`
  )
  const text = validateImportText(body.text)
  const options = parseGenerationOptions(body.options) || {
    ...DEFAULT_GENERATION_OPTIONS,
    types: [...DEFAULT_GENERATION_OPTIONS.types],
  }
  return {
    studentId: body.studentId,
    lessonDate: body.lessonDate,
    title: title || null,
    sourceName: sourceName || null,
    text,
    options,
  }
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return
  if (!(await requireTeacher(req, res))) return

  try {
    const input = parse(bodyOf(req))
    const admin = createAdminClient()

    if (!(await isExistingStudent(admin, input.studentId))) {
      return res.status(404).json({ error: 'Élève introuvable.' })
    }

    const { data: lesson, error } = await admin
      .from('lessons')
      .insert({
        student_id: input.studentId,
        lesson_date: input.lessonDate,
        title: input.title,
        transcript: null,
        canva: null,
        status: 'generating',
        source_kind: 'import',
        source_name: input.sourceName,
        source_text: input.text,
        generation_options: input.options,
      })
      .select('*')
      .single()
    if (error && isMissingImportColumns(error)) {
      console.error('[api] teacher/lessons/import: migration 0005 not applied:', error)
      return res.status(500).json({ error: MIGRATION_0005_MESSAGE })
    }
    if (error) throw error

    const result = await runLessonGeneration(admin, lesson, { title: input.title, options: input.options })
    return res.status(201).json({ lesson: result })
  } catch (err) {
    return handleError(res, err, 'teacher/lessons/import POST', 'fr')
  }
}
