import { describe, expect, it } from 'vitest'
import { normalizePlan, planToText } from '@/components/teacher/students/planText'

const content = {
  title: 'Voyage à Lyon',
  trial: true,
  duration_min: 50,
  objectives: ['Parler de **ses projets**', ''],
  sections: [
    { heading: 'Warm-up', minutes: 5, body: 'Question : **Où** es-tu allé ?\nRéponse libre.' },
    { heading: 'Jeu de rôle', minutes: null, body: 'À la gare.' },
    { heading: '', body: '' },
  ],
  homework_questions: ['Veux-tu des devoirs ?'],
}

describe('normalizePlan', () => {
  it('fills defaults for missing or malformed fields', () => {
    expect(normalizePlan(null)).toEqual({
      title: 'Plan de cours',
      trial: false,
      durationMin: null,
      objectives: [],
      sections: [],
      homeworkQuestions: [],
    })
  })
  it('drops empty items and keeps null minutes', () => {
    const plan = normalizePlan(content)
    expect(plan.objectives).toEqual(['Parler de **ses projets**'])
    expect(plan.sections).toHaveLength(2)
    expect(plan.sections[1].minutes).toBeNull()
  })
})

describe('planToText', () => {
  it('renders plain text without the ** markers', () => {
    expect(planToText(content)).toBe(
      [
        'Voyage à Lyon',
        "50 min · Cours d'essai",
        '',
        'Objectifs :',
        '- Parler de ses projets',
        '',
        '1. Warm-up (5 min)',
        'Question : Où es-tu allé ?\nRéponse libre.',
        '',
        '2. Jeu de rôle',
        'À la gare.',
        '',
        'Questions sur les devoirs :',
        '- Veux-tu des devoirs ?',
      ].join('\n')
    )
  })
})
