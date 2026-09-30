// Tutor lesson plan (POST /api/teacher/students/[id]/plans `content`) helpers. Pure:
// tests/planText.test.js.
//   content = { title, trial, duration_min, objectives: string[],
//               sections: [{ heading, minutes|null, body }], homework_questions: string[] }

const str = (v) => (typeof v === 'string' ? v.trim() : '')
const list = (v) => (Array.isArray(v) ? v : [])

/** Safe view of a plan's content (missing / malformed fields become empty). */
export function normalizePlan(content) {
  const c = content && typeof content === 'object' ? content : {}
  const minutes = Number(c.duration_min)
  return {
    title: str(c.title) || 'Plan de cours',
    trial: c.trial === true,
    durationMin: Number.isFinite(minutes) && minutes > 0 ? Math.round(minutes) : null,
    objectives: list(c.objectives).map(str).filter(Boolean),
    sections: list(c.sections)
      .map((s) => ({
        heading: str(s?.heading),
        minutes: Number.isFinite(Number(s?.minutes)) && s?.minutes !== null ? Math.round(Number(s.minutes)) : null,
        body: str(s?.body),
      }))
      .filter((s) => s.heading || s.body),
    homeworkQuestions: list(c.homework_questions).map(str).filter(Boolean),
  }
}

// **bold** markers are for the on-screen highlight only
const plain = (text) => text.replace(/\*\*([^*\n]+?)\*\*/g, '$1')

/** Plain-text version of a plan, to paste in notes or Canva. */
export function planToText(content) {
  const p = normalizePlan(content)
  const lines = [p.title]
  const meta = [p.durationMin ? `${p.durationMin} min` : '', p.trial ? "Cours d'essai" : ''].filter(Boolean)
  if (meta.length) lines.push(meta.join(' · '))
  if (p.objectives.length) {
    lines.push('', 'Objectifs :', ...p.objectives.map((o) => `- ${plain(o)}`))
  }
  p.sections.forEach((s, i) => {
    lines.push('', `${i + 1}. ${plain(s.heading) || 'Étape'}${s.minutes ? ` (${s.minutes} min)` : ''}`)
    if (s.body) lines.push(plain(s.body))
  })
  if (p.homeworkQuestions.length) {
    lines.push('', 'Questions sur les devoirs :', ...p.homeworkQuestions.map((q) => `- ${plain(q)}`))
  }
  return lines.join('\n')
}
