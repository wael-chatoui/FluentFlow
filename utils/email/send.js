// Transactional email helpers (student notifications and teacher exercise reports).
// Uses Resend REST API (https://api.resend.com/emails) via native fetch (Node 22).
// When RESEND_API_KEY is missing or in test environment, logs the email in the console
// (mock mode, similar to AI_DEMO) so local dev and tests run without external credentials.
import { isPlaceholderEmail } from '@/utils/api/placeholders'

const RESEND_ENDPOINT = 'https://api.resend.com/emails'
const DEFAULT_FROM = 'FluentFlow <onboarding@resend.dev>'

/** True when transactional emails should actually be sent through Resend. */
export function hasEmailConfig() {
  return Boolean(process.env.RESEND_API_KEY && process.env.RESEND_API_KEY.trim())
}

/**
 * Sends an email via Resend or logs it to console if no key is configured.
 * @param {{ to: string|string[], subject: string, html: string, text?: string, from?: string }} params
 * @returns {Promise<{ ok: boolean, id?: string, mocked?: boolean, error?: string }>}
 */
export async function sendEmail({ to, subject, html, text, from }) {
  const recipients = Array.isArray(to) ? to.map((s) => String(s).trim()).filter(Boolean) : [String(to || '').trim()].filter(Boolean)
  if (!recipients.length) return { ok: false, error: 'No recipients provided' }

  // Filter out placeholder student emails
  const validRecipients = recipients.filter((addr) => !isPlaceholderEmail(addr))
  if (!validRecipients.length) {
    return { ok: false, error: 'All recipients are placeholder addresses' }
  }

  const sender = from || process.env.EMAIL_FROM || DEFAULT_FROM
  const plainText = text || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

  if (!hasEmailConfig() || process.env.NODE_ENV === 'test') {
    if (process.env.NODE_ENV !== 'test') {
      console.log(`[email:mock] From: ${sender} | To: ${validRecipients.join(', ')} | Subject: ${subject}`)
    }
    return { ok: true, mocked: true }
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY.trim()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: sender,
        to: validRecipients,
        subject,
        html,
        text: plainText,
      }),
    })

    if (!res.ok) {
      const errBody = await res.text().catch(() => '')
      console.error(`[email] Resend API error (${res.status}):`, errBody)
      return { ok: false, error: `Resend error: ${res.status}` }
    }

    const data = await res.json().catch(() => ({}))
    return { ok: true, id: data?.id }
  } catch (err) {
    console.error('[email] Failed to send email:', err)
    return { ok: false, error: err?.message || 'Network error' }
  }
}

/**
 * Sends a notification email to a student when a new lesson is published.
 * In English, since the student UI and communication is in English.
 */
export async function sendStudentNewLessonEmail({ studentEmail, studentName, lessonTitle, lessonId, siteUrl }) {
  if (!studentEmail || isPlaceholderEmail(studentEmail)) return { ok: false, skipped: true }

  const base = (siteUrl || process.env.NEXT_PUBLIC_SITE_URL || 'https://fluent-flow-mu.vercel.app').replace(/\/+$/, '')
  const lessonUrl = `${base}/student/lessons/${lessonId}`
  const firstName = (studentName || '').trim().split(/\s+/)[0] || 'there'
  const title = (lessonTitle || '').trim() || 'New French lesson'

  const subject = `New French lesson ready: ${title} 🇫🇷`
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f7f9fa; color: #1f2937; margin: 0; padding: 24px; }
    .card { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e5e7eb; padding: 32px 24px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); }
    h1 { font-size: 20px; font-weight: 700; color: #111827; margin: 0 0 16px 0; }
    p { font-size: 15px; line-height: 1.6; color: #4b5563; margin: 0 0 16px 0; }
    .btn-wrap { text-align: center; margin: 28px 0; }
    .btn { display: inline-block; background-color: #2563eb; color: #ffffff !important; font-weight: 600; font-size: 15px; text-decoration: none; padding: 12px 24px; border-radius: 12px; }
    .footer { font-size: 12px; color: #9ca3af; text-align: center; margin-top: 24px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Bonjour ${firstName} ! 🇫🇷</h1>
    <p>Wael just published your new lesson recap and practice exercises on FluentFlow:</p>
    <p style="font-weight: 600; font-size: 16px; color: #1f2937; margin: 12px 0 20px 0;">« ${title} »</p>
    <p>You can read the conversation summary, review key vocabulary, and practice with Duolingo-style exercises to reinforce what we covered.</p>
    <div class="btn-wrap">
      <a href="${lessonUrl}" class="btn" target="_blank" rel="noopener noreferrer">Start practicing</a>
    </div>
    <p style="margin-bottom: 0;">See you soon in our next class!</p>
  </div>
  <div class="footer">
    FluentFlow · French Lessons with Wael
  </div>
</body>
</html>
`

  const text = `Bonjour ${firstName}!\n\nWael just published your new lesson recap: "${title}".\n\nPractice and review your notes here:\n${lessonUrl}\n\nSee you soon in our next class!`

  return sendEmail({
    to: studentEmail,
    subject,
    html,
    text,
  })
}

/**
 * Resolves recipient teacher emails for a student:
 * 1. The teacher who invited the student (join_links.created_by).
 * 2. Or any active accounts with role 'teacher' in Supabase Auth.
 * 3. Fallback to process.env.TEACHER_EMAIL if defined.
 */
export async function resolveTeacherEmails(admin, studentId) {
  if (studentId) {
    try {
      const { data: link } = await admin
        .from('join_links')
        .select('created_by')
        .or(`student_id.eq.${studentId},used_by.eq.${studentId}`)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (link?.created_by) {
        const { data: teacherUser } = await admin.auth.admin.getUserById(link.created_by)
        if (teacherUser?.user?.email && !teacherUser.user.banned_until) {
          return [teacherUser.user.email]
        }
      }
    } catch (err) {
      console.warn('[email] Failed to resolve teacher from join_links:', err)
    }
  }

  try {
    const { data: usersData } = await admin.auth.admin.listUsers({ perPage: 50 })
    const teachers = (usersData?.users || []).filter(
      (u) => u.app_metadata?.role === 'teacher' && !u.banned_until && u.email
    )
    const emails = teachers.map((u) => u.email).filter(Boolean)
    if (emails.length) return emails
  } catch (err) {
    console.warn('[email] Failed to list teacher accounts:', err)
  }

  return process.env.TEACHER_EMAIL ? [process.env.TEACHER_EMAIL] : []
}

/**
 * Sends an email to the teacher when a student reports an issue on an exercise.
 * In French, since teacher communication and back office is in French.
 */
export async function sendTeacherExerciseReportEmail({
  teacherEmail,
  studentName,
  lessonTitle,
  lessonId,
  exercise,
  reason,
  note,
  siteUrl,
}) {
  const recipient = teacherEmail || process.env.TEACHER_EMAIL
  if (!recipient || (Array.isArray(recipient) && !recipient.length)) {
    console.warn('[email] No teacher email available to receive exercise report notification')
    return { ok: false, skipped: true }
  }

  const base = (siteUrl || process.env.NEXT_PUBLIC_SITE_URL || 'https://fluent-flow-mu.vercel.app').replace(/\/+$/, '')
  const lessonUrl = `${base}/teacher/lessons/${lessonId}`
  const sName = (studentName || 'Un élève').trim()
  const lTitle = (lessonTitle || 'Leçon').trim()

  const subject = `[FluentFlow] Exercice signalé par ${sName} — ${lTitle}`

  // Exercise details for teacher
  let exerciseDetails = `Type : ${exercise?.type || 'inconnu'} (ID : ${exercise?.id || '?'})\nConsigne : ${exercise?.prompt || '-'}`
  if (exercise?.sentence) exerciseDetails += `\nPhrase : ${exercise.sentence}`
  if (exercise?.choices) exerciseDetails += `\nChoix : ${exercise.choices.join(', ')} (Réponse : ${exercise.choices[exercise.answer] || exercise.answer})`
  if (exercise?.answers) exerciseDetails += `\nRéponses acceptées : ${exercise.answers.join(' / ')}`
  if (exercise?.pairs) exerciseDetails += `\nPaires : ${exercise.pairs.map((p) => `${p.fr} = ${p.en}`).join(', ')}`
  if (exercise?.explanation) exerciseDetails += `\nExplication : ${exercise.explanation}`

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f7f9fa; color: #1f2937; margin: 0; padding: 24px; }
    .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e5e7eb; padding: 28px 24px; }
    h1 { font-size: 18px; color: #b91c1c; margin: 0 0 16px 0; }
    p { font-size: 14px; line-height: 1.5; color: #4b5563; margin: 0 0 12px 0; }
    .box { background: #fef2f2; border: 1px solid #fee2e2; border-radius: 8px; padding: 14px; margin: 16px 0; font-size: 14px; }
    .exercise-box { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; margin: 16px 0; font-family: monospace; font-size: 13px; white-space: pre-wrap; }
    .btn { display: inline-block; background-color: #1f2937; color: #ffffff !important; font-weight: 600; font-size: 14px; text-decoration: none; padding: 10px 20px; border-radius: 10px; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>⚠️ Exercice signalé par un élève</h1>
    <p><strong>Élève :</strong> ${sName}</p>
    <p><strong>Leçon :</strong> ${lTitle}</p>
    
    <div class="box">
      <p style="margin: 0 0 6px 0; font-weight: 600; color: #991b1b;">Motif : ${reason || 'Non précisé'}</p>
      ${note ? `<p style="margin: 0; color: #4b5563;"><strong>Note de l'élève :</strong> « ${note} »</p>` : ''}
    </div>

    <p style="font-weight: 600; margin-bottom: 4px;">Détails de l'exercice (désactivé temporairement) :</p>
    <div class="exercise-box">${exerciseDetails}</div>

    <p style="font-size: 13px; color: #6b7280;">L'exercice a été automatiquement désactivé dans la leçon pour éviter que l'élève ne retombe dessus.</p>

    <div style="text-align: center; margin-top: 20px;">
      <a href="${lessonUrl}" class="btn" target="_blank" rel="noopener noreferrer">Ouvrir la leçon pour corriger ou réactiver</a>
    </div>
  </div>
</body>
</html>
`

  const text = `Exercice signalé par ${sName} dans la leçon "${lTitle}"\n\nMotif : ${reason || 'Non précisé'}\nNote de l'élève : ${note || 'Aucune'}\n\nDétails de l'exercice (désactivé) :\n${exerciseDetails}\n\nOuvrir la leçon : ${lessonUrl}`

  return sendEmail({
    to: recipient,
    subject,
    html,
    text,
  })
}
