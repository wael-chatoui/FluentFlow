import { useId, useState } from 'react'
import RichText, { RichTextInline } from '@/components/lesson/RichText'
import { api } from '@/utils/apiClient'
import useUnsavedGuard from '@/components/ui/useUnsavedGuard'
import GenerationProgress, { generationSteps } from '@/components/teacher/GenerationProgress'
import { CopyButton } from '@/components/teacher/CopyField'
import { normalizePlan, planToText } from '@/components/teacher/students/planText'
import { formatCount, formatDateTime, isAbortError } from '@/components/teacher/format'
import { useApiResource, useMountedRef } from '@/components/teacher/hooks'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/students/PlanPanel.module.css'

const MAX_FOCUS = 1000
const PLAN_STEPS = generationSteps({ mode: 'plan' })

/** One plan: title, duration, objectives, timed sections, trial homework questions. */
export function PlanView({ content, headingLevel = 3 }) {
  const plan = normalizePlan(content)
  const Heading = `h${headingLevel}`
  const Sub = `h${headingLevel + 1}`
  return (
    <article className={styles.plan}>
      <div className={styles.planHead}>
        <Heading className={styles.planTitle}>{plan.title}</Heading>
        <div className={styles.planMeta}>
          {plan.durationMin && (
            <span className={styles.pill}>
              <span aria-hidden="true">⏱️</span>
              {plan.durationMin} min
            </span>
          )}
          {plan.trial && <span className={`${styles.pill} ${styles.pillTrial}`}>Cours d&apos;essai</span>}
        </div>
      </div>
      {plan.objectives.length > 0 && (
        <div className={styles.block}>
          <Sub className={styles.blockTitle}>Objectifs</Sub>
          <ul className={styles.objectives}>
            {plan.objectives.map((o, i) => (
              <li key={i}>
                <RichTextInline text={o} />
              </li>
            ))}
          </ul>
        </div>
      )}
      {plan.sections.length > 0 && (
        <ol className={styles.sections}>
          {plan.sections.map((s, i) => (
            <li key={i} className={styles.section}>
              <div className={styles.sectionHead}>
                <span className={styles.sectionNumber} aria-hidden="true">{i + 1}</span>
                <Sub className={styles.sectionTitle}>
                  <RichTextInline text={s.heading || 'Étape'} />
                </Sub>
                {s.minutes ? <span className={styles.minutes}>{s.minutes} min</span> : null}
              </div>
              <RichText text={s.body} className={styles.sectionBody} />
            </li>
          ))}
        </ol>
      )}
      {plan.homeworkQuestions.length > 0 && (
        <div className={`${styles.block} ${styles.homework}`}>
          <Sub className={styles.blockTitle}>Questions sur les devoirs (cours d&apos;essai)</Sub>
          <ol className={styles.objectives}>
            {plan.homeworkQuestions.map((q, i) => (
              <li key={i}>
                <RichTextInline text={q} />
              </li>
            ))}
          </ol>
        </div>
      )}
    </article>
  )
}

/**
 * « Préparer le prochain cours »: optional focus, synchronous AI call (≈30–90 s) returning a
 * tutor plan (never shown to the student), plain-text copy, and the previous plans.
 * @param {{ studentId: string, studentName: string }} props
 */
export default function PlanPanel({ studentId, studentName }) {
  const uid = useId()
  const mounted = useMountedRef()
  const history = useApiResource(`/api/teacher/students/${studentId}/plans`, {
    errorMessage: "Impossible de charger l'historique des plans.",
  })
  const [focus, setFocus] = useState('')
  const [startedAt, setStartedAt] = useState(null)
  const [error, setError] = useState(null)
  const [current, setCurrent] = useState(null) // { id, focus, content, created_at }
  const generating = startedAt !== null

  useUnsavedGuard(generating, 'Le plan est en cours de préparation. Quitter quand même ?')

  const generate = async (e) => {
    e.preventDefault()
    if (generating || focus.length > MAX_FOCUS) return
    setStartedAt(Date.now())
    setError(null)
    try {
      const body = focus.trim() ? { focus: focus.trim() } : {}
      const res = await api(`/api/teacher/students/${studentId}/plans`, { method: 'POST', body, timeout: 300_000 })
      if (!mounted.current) return
      setCurrent(res.plan)
      if (res.plan?.id) {
        history.setData((prev) => ({ plans: [res.plan, ...(prev?.plans || []).filter((p) => p.id !== res.plan.id)] }))
      }
    } catch (err) {
      if (!isAbortError(err) && mounted.current) setError(err.message || 'La préparation du plan a échoué.')
    } finally {
      if (mounted.current) setStartedAt(null)
    }
  }

  const previous = (history.data?.plans || []).filter((p) => p.id !== current?.id)

  return (
    <section id="plan" tabIndex={-1} className={`${ui.card} ${styles.panel}`} aria-labelledby={`${uid}-title`}>
      <div className={styles.head}>
        <h2 id={`${uid}-title`} className={`${ui.sectionTitle} ${styles.title}`}>
          <span aria-hidden="true">🗺️</span> Préparer le prochain cours
        </h2>
        <p className={styles.sub}>
          Un plan pour toi (jamais montré à {studentName}), construit à partir de son profil, du contexte pour l&apos;IA
          et de ses dernières leçons.
        </p>
      </div>

      <form className={styles.form} onSubmit={generate} noValidate>
        <div className={styles.labelRow}>
          <label htmlFor={`${uid}-focus`} className={bits.label}>
            Sujet ou priorité <span className={bits.optional}>(facultatif)</span>
          </label>
          <span id={`${uid}-count`} className={`${styles.count} ${focus.length > MAX_FOCUS ? styles.countOver : ''}`}>
            {formatCount(focus.length)} / {formatCount(MAX_FOCUS)}
          </span>
        </div>
        <textarea
          id={`${uid}-focus`}
          className={`${bits.textarea} ${styles.focus} ${focus.length > MAX_FOCUS ? bits.invalid : ''}`}
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          rows={3}
          placeholder="Ex. : réviser le passé composé, préparer son voyage à Lyon, cours d'essai…"
          disabled={generating}
          aria-describedby={`${uid}-count`}
          aria-invalid={focus.length > MAX_FOCUS || undefined}
        />
        <button
          type="submit"
          className={`${ui.btn} ${ui.purple} ${styles.submit}`}
          disabled={generating || focus.length > MAX_FOCUS}
          aria-busy={generating || undefined}
        >
          {generating ? <span className={bits.spinner} aria-hidden="true" /> : <span aria-hidden="true">✨</span>}
          {generating ? 'Préparation…' : current ? 'Générer un autre plan' : 'Générer le plan'}
        </button>
      </form>

      {generating && (
        <GenerationProgress
          startedAt={startedAt}
          heading="Préparation du plan…"
          sub="Cela prend en général 30 à 90 secondes. Reste sur cette page."
          steps={PLAN_STEPS}
        />
      )}

      {error && (
        <div className={`${bits.alert} ${bits.error}`} role="alert">
          <span className={bits.alertIcon} aria-hidden="true">⚠️</span>
          <span className={bits.alertBody}>{error}</span>
        </div>
      )}

      {current && !generating && (
        <div className={styles.result} aria-live="polite">
          <div className={styles.resultBar}>
            <span className={styles.resultLabel}>
              <span aria-hidden="true">✓ </span>Nouveau plan
              {current.id ? '' : ' (non enregistré dans l’historique)'}
            </span>
            <CopyButton text={planToText(current.content)} label="Copier le plan" tone="blue" />
          </div>
          <PlanView content={current.content} />
        </div>
      )}

      <div className={styles.history}>
        <h3 className={styles.historyTitle}>Plans précédents</h3>
        {history.loading ? (
          <span className={ui.skel} style={{ height: 48, borderRadius: 14 }} aria-hidden="true" />
        ) : history.error ? (
          <p className={styles.historyEmpty}>
            {history.error}{' '}
            <button type="button" className={bits.linkButton} onClick={history.reload}>
              Réessayer
            </button>
          </p>
        ) : previous.length === 0 ? (
          <p className={styles.historyEmpty}>Aucun plan pour l&apos;instant.</p>
        ) : (
          <ul className={styles.historyList}>
            {previous.map((p) => (
              <li key={p.id}>
                <details className={styles.historyItem}>
                  <summary className={styles.historySummary}>
                    <span className={styles.historyName}>{normalizePlan(p.content).title}</span>
                    <span className={styles.historyMeta}>
                      {formatDateTime(p.created_at)}
                      {p.focus ? ` · ${p.focus}` : ''}
                    </span>
                  </summary>
                  <div className={styles.historyBody}>
                    <CopyButton text={planToText(p.content)} label="Copier le plan" />
                    <PlanView content={p.content} headingLevel={4} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
