// POST /api/teacher/lessons { studentId, lessonDate, title?, transcript, canva } → 201 { lesson: { id, status, error } }
// Runs the AI synchronously (30–120 s). The row is kept even if generation fails.
import { allowMethods, requireTeacher } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { fail, handleError } from '@/utils/api/errors'
import { LIMITS, bodyOf, isIsoDate, isUuid, optionalText } from '@/utils/api/validate'
import { isStudentAccount } from '@/utils/api/students'
import { runLessonGeneration, validateSources } from '@/utils/ai/lessonPipeline'

export const config = { maxDuration: 300, api: { bodyParser: { sizeLimit: '2mb' } } }

function parse(body) {
  if (!isUuid(body.studentId)) fail('Élève invalide.')
  if (!isIsoDate(body.lessonDate)) fail('Date du cours invalide (format AAAA-MM-JJ).')
  const title = optionalText(body.title, LIMITS.title, `Le titre doit faire au plus ${LIMITS.title} caractères.`)
  const sources = validateSources(body.transcript, body.canva)
  return { studentId: body.studentId, lessonDate: body.lessonDate, title: title || null, ...sources }
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return
  if (!(await requireTeacher(req, res))) return

  try {
    const input = parse(bodyOf(req))
    const admin = createAdminClient()

    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('id')
      .eq('id', input.studentId)
      .maybeSingle()
    if (profileError) throw profileError
    if (!profile || !(await isStudentAccount(admin, input.studentId))) {
      return res.status(404).json({ error: 'Élève introuvable.' })
    }

    const { data: lesson, error } = await admin
      .from('lessons')
      .insert({
        student_id: input.studentId,
        lesson_date: input.lessonDate,
        title: input.title,
        transcript: input.transcript,
        canva: input.canva,
        status: 'generating',
      })
      .select('id, student_id, lesson_date, transcript, canva')
      .single()
    if (error) throw error

    const result = await runLessonGeneration(admin, lesson, { title: input.title })
    return res.status(201).json({ lesson: result })
  } catch (err) {
    return handleError(res, err, 'teacher/lessons POST', 'fr')
  }
}
