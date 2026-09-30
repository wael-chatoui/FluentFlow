// POST /api/teacher/lessons/import { studentId, lessonDate, title?, sourceName, text, options,
//      clientKey, publish? = true } → 202 { lesson: { id, status: 'generating', error: null } }
//      (same clientKey again → 200 { lesson: { id, status, error }, duplicate: true })
// One imported document (PDF / Google Doc text) = one lesson, generated in the
// background like POST /api/teacher/lessons (source_kind 'import').
import { allowMethods, normalizeUuid, requireTeacher } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { fail, handleError } from '@/utils/api/errors'
import {
  LIMITS,
  allowSameOrigin,
  bodyOf,
  isIsoDate,
  isUuid,
  optionalBoolean,
  optionalText,
  parseClientKey,
  parseGenerationOptions,
  parseSourceName,
  validateImportText,
} from '@/utils/api/validate'
import { isExistingStudent } from '@/utils/api/students'
import { effectiveOptions } from '@/utils/ai/options'
import { insertGeneratingLesson, lessonSummary, startLessonGeneration } from '@/utils/ai/lessonPipeline'

// maxDuration also bounds the background generation (Vercel waitUntil)
export const config = { maxDuration: 300, api: { bodyParser: { sizeLimit: '1mb' } } }

function parse(body) {
  if (!isUuid(body.studentId)) fail('Élève invalide.')
  if (!isIsoDate(body.lessonDate)) fail('Date du cours invalide (format AAAA-MM-JJ).')
  const title = optionalText(body.title, LIMITS.title, `Le titre doit faire au plus ${LIMITS.title} caractères.`)
  const publish = optionalBoolean(body.publish, 'Le champ « publier » est invalide.')
  return {
    studentId: normalizeUuid(body.studentId),
    lessonDate: body.lessonDate,
    title: title || null,
    sourceName: parseSourceName(body.sourceName),
    text: validateImportText(body.text),
    // Stored with the lesson so a regeneration reuses them
    options: effectiveOptions('import', parseGenerationOptions(body.options)),
    clientKey: parseClientKey(body.clientKey),
    publish: publish !== false,
  }
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return
  if (!allowSameOrigin(req, res)) return
  if (!(await requireTeacher(req, res))) return

  try {
    const input = parse(bodyOf(req))
    const admin = createAdminClient()

    if (!(await isExistingStudent(admin, input.studentId))) {
      return res.status(404).json({ error: 'Élève introuvable.' })
    }

    const { lesson, duplicate } = await insertGeneratingLesson(admin, {
      student_id: input.studentId,
      lesson_date: input.lessonDate,
      title: input.title,
      transcript: null,
      canva: null,
      source_kind: 'import',
      source_name: input.sourceName,
      source_text: input.text,
      generation_options: input.options,
      hidden: !input.publish,
      client_key: input.clientKey,
    })
    if (duplicate) return res.status(200).json({ lesson: lessonSummary(lesson), duplicate: true })

    const summary = startLessonGeneration(admin, lesson, { title: input.title, options: input.options })
    return res.status(202).json({ lesson: summary })
  } catch (err) {
    return handleError(res, err, 'teacher/lessons/import POST', 'fr')
  }
}
