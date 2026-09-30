// POST /api/teacher/lessons { studentId, lessonDate, title?, transcript, canva, clientKey,
//      publish? = true, options? } → 202 { lesson: { id, status: 'generating', error: null } }
//      (same clientKey again → 200 { lesson: { id, status, error }, duplicate: true })
// The AI runs in the background after the response; the browser polls
// GET /api/teacher/lessons/[id]. publish: false creates a draft hidden from the student.
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
  validateSources,
} from '@/utils/api/validate'
import { isExistingStudent } from '@/utils/api/students'
import { insertGeneratingLesson, lessonSummary, startLessonGeneration } from '@/utils/ai/lessonPipeline'

// maxDuration also bounds the background generation (Vercel waitUntil)
export const config = { maxDuration: 300, api: { bodyParser: { sizeLimit: '2mb' } } }

function parse(body) {
  if (!isUuid(body.studentId)) fail('Élève invalide.')
  if (!isIsoDate(body.lessonDate)) fail('Date du cours invalide (format AAAA-MM-JJ).')
  const title = optionalText(body.title, LIMITS.title, `Le titre doit faire au plus ${LIMITS.title} caractères.`)
  const sources = validateSources(body.transcript, body.canva)
  const publish = optionalBoolean(body.publish, 'Le champ « publier » est invalide.')
  return {
    studentId: normalizeUuid(body.studentId),
    lessonDate: body.lessonDate,
    title: title || null,
    clientKey: parseClientKey(body.clientKey),
    publish: publish !== false,
    options: parseGenerationOptions(body.options) || null,
    ...sources,
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
      transcript: input.transcript,
      canva: input.canva,
      source_kind: 'transcript',
      generation_options: input.options,
      hidden: !input.publish,
      client_key: input.clientKey,
    })
    if (duplicate) return res.status(200).json({ lesson: lessonSummary(lesson), duplicate: true })

    const summary = startLessonGeneration(admin, lesson, { title: input.title, options: input.options })
    return res.status(202).json({ lesson: summary })
  } catch (err) {
    return handleError(res, err, 'teacher/lessons POST', 'fr')
  }
}
