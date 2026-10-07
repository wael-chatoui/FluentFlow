// POST /api/student/lessons/[id]/exercises/[exerciseId]/report { reason?, note? }
// Allows a student to report an issue with an exercise during practice.
// The exercise is immediately deactivated in lessons.exercises (disabled: true, reported: {...})
// and a notification email is sent in the background to the tutor (Wael).
import { allowMethods, requireUser } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { handleError } from '@/utils/api/errors'
import { bodyOf, isUuid, optionalText } from '@/utils/api/validate'
import { visibleLessons } from '@/utils/api/studentLessons'
import { runInBackground } from '@/utils/api/background'
import { resolveTeacherEmails, sendTeacherExerciseReportEmail } from '@/utils/email/send'

export const config = { api: { bodyParser: { sizeLimit: '64kb' } } }

const MAX_REASON_LEN = 120
const MAX_NOTE_LEN = 600

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return
  const auth = await requireUser(req, res, { lang: 'en' })
  if (!auth) return

  const lessonId = typeof req.query.id === 'string' ? req.query.id.toLowerCase() : ''
  const exerciseId = typeof req.query.exerciseId === 'string' ? req.query.exerciseId.trim() : ''

  if (!isUuid(lessonId) || !exerciseId || exerciseId.length > 40) {
    return res.status(400).json({ error: 'Invalid lesson or exercise identifier' })
  }

  const body = bodyOf(req)
  const reason = optionalText(body.reason, MAX_REASON_LEN, 'Reason is too long') || 'Issue reported by student'
  const note = optionalText(body.note, MAX_NOTE_LEN, 'Note is too long') || null

  try {
    const admin = createAdminClient()

    // Ensure the lesson is visible and belongs to this student
    const { data: lesson, error } = await visibleLessons(admin, auth.user.id, 'id, student_id, title, exercises')
      .eq('id', lessonId)
      .maybeSingle()
    if (error) throw error
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found' })
    }

    const exercises = Array.isArray(lesson.exercises) ? lesson.exercises : []
    const target = exercises.find((e) => e && e.id === exerciseId)
    if (!target) {
      return res.status(404).json({ error: 'Exercise not found in this lesson' })
    }

    const reportMeta = {
      at: new Date().toISOString(),
      reason,
      note,
      student_id: auth.user.id,
    }

    // Mark exercise disabled: true and attach reportMeta
    const updatedExercises = exercises.map((e) => {
      if (e && e.id === exerciseId) {
        return {
          ...e,
          disabled: true,
          reported: reportMeta,
        }
      }
      return e
    })

    const { error: updateError } = await admin
      .from('lessons')
      .update({ exercises: updatedExercises })
      .eq('id', lessonId)
    if (updateError) throw updateError

    // Notify teacher in background
    runInBackground(async () => {
      try {
        const [profileRes, teacherEmails] = await Promise.all([
          admin.from('profiles').select('full_name, email').eq('id', auth.user.id).maybeSingle(),
          resolveTeacherEmails(admin, auth.user.id),
        ])

        const profile = profileRes.data
        if (teacherEmails.length) {
          await sendTeacherExerciseReportEmail({
            teacherEmail: teacherEmails,
            studentName: profile?.full_name || profile?.email || 'Student',
            lessonTitle: lesson.title,
            lessonId: lesson.id,
            exercise: target,
            reason,
            note,
          })
        }
      } catch (err) {
        console.error('[report] Failed to notify teacher:', err)
      }
    }, `report exercise ${exerciseId} in lesson ${lessonId}`)

    return res.status(200).json({ success: true, disabled: true })
  } catch (err) {
    return handleError(res, err, 'student/lessons/[id]/exercises/[exerciseId]/report', 'en')
  }
}
