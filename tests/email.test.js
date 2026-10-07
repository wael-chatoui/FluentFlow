import { describe, expect, it } from 'vitest'
import { sendEmail, sendStudentNewLessonEmail, sendTeacherExerciseReportEmail, hasEmailConfig } from '@/utils/email/send'

describe('email helper', () => {
  it('returns false when no recipients provided', async () => {
    const res = await sendEmail({ to: '', subject: 'Test', html: '<p>Hi</p>' })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('No recipients provided')
  })

  it('filters out placeholder invalid emails', async () => {
    const res = await sendEmail({
      to: 'invite-1234567890abcdef@placeholder.invalid',
      subject: 'Test',
      html: '<p>Hi</p>',
    })
    expect(res.ok).toBe(false)
    expect(res.error).toBe('All recipients are placeholder addresses')
  })

  it('sends mocked email in test environment', async () => {
    const res = await sendEmail({
      to: 'student@example.com',
      subject: 'Test Subject',
      html: '<p>Hello world</p>',
    })
    expect(res.ok).toBe(true)
    expect(res.mocked).toBe(true)
  })

  it('sendStudentNewLessonEmail skips placeholder addresses', async () => {
    const res = await sendStudentNewLessonEmail({
      studentEmail: 'invite-abc@placeholder.invalid',
      studentName: 'Alice',
      lessonTitle: 'Passé Composé',
      lessonId: '123e4567-e89b-12d3-a456-426614174000',
    })
    expect(res.ok).toBe(false)
    expect(res.skipped).toBe(true)
  })

  it('sendStudentNewLessonEmail formats and sends student notification', async () => {
    const res = await sendStudentNewLessonEmail({
      studentEmail: 'student@example.com',
      studentName: 'Benjamin',
      lessonTitle: 'Voyage à Paris',
      lessonId: '123e4567-e89b-12d3-a456-426614174000',
      siteUrl: 'https://fluentflow.test',
    })
    expect(res.ok).toBe(true)
    expect(res.mocked).toBe(true)
  })

  it('sendTeacherExerciseReportEmail formats report and notifies teacher', async () => {
    const res = await sendTeacherExerciseReportEmail({
      teacherEmail: 'wael@example.com',
      studentName: 'Sarah',
      lessonTitle: 'Les Verbes Réfléchis',
      lessonId: '123e4567-e89b-12d3-a456-426614174000',
      exercise: {
        id: 'ex_1',
        type: 'fill_blank',
        prompt: 'Complète la phrase',
        sentence: 'Je ___ tous les matins.',
        answers: ['me réveille'],
        explanation: 'Verbe se réveiller',
      },
      reason: 'Typo in prompt',
      note: 'The sentence has a missing word',
      siteUrl: 'https://fluentflow.test',
    })
    expect(res.ok).toBe(true)
    expect(res.mocked).toBe(true)
  })
})
