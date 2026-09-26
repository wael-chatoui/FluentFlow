import Link from 'next/link'
import StatusPill from '@/components/admin/common/StatusPill'
import { formatDate, formatDateTime, formatNumber, formatRelative } from '@/components/admin/common/format'
import admin from '@/components/admin/common/admin.module.css'
import styles from '@/components/admin/lessons/editor.module.css'

function usageText(usage) {
  if (!usage || typeof usage !== 'object') return null
  const prompt = Number(usage.prompt_tokens) || 0
  const completion = Number(usage.completion_tokens) || 0
  const total = Number(usage.total_tokens) || prompt + completion
  if (!total) return null
  return `${formatNumber(total)} tokens (${formatNumber(prompt)} entrée · ${formatNumber(completion)} sortie)`
}

/** Summary card at the top of the lesson editor (server values, not the draft). */
export default function LessonHeader({ lesson }) {
  const usage = usageText(lesson.ai_usage)
  return (
    <section className={`${admin.section} ${styles.header}`} aria-label="Résumé de la leçon">
      <dl className={styles.facts}>
        <div>
          <dt>Élève</dt>
          <dd>
            {lesson.student_id ? (
              <Link href={`/admin/users/${lesson.student_id}`} className={admin.link}>
                {lesson.student_name || 'Élève'}
              </Link>
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt>Date</dt>
          <dd>{formatDate(lesson.lesson_date, { long: true })}</dd>
        </div>
        <div>
          <dt>Statut</dt>
          <dd>
            <StatusPill status={lesson.status} />
          </dd>
        </div>
        <div>
          <dt>Modèle IA</dt>
          <dd>{lesson.ai_model ? <span className={admin.mono}>{lesson.ai_model}</span> : '—'}</dd>
        </div>
        <div>
          <dt>Consommation</dt>
          <dd>{usage || '—'}</dd>
        </div>
        <div>
          <dt>Générée</dt>
          <dd title={formatDateTime(lesson.generated_at)}>
            {lesson.generated_at ? formatRelative(lesson.generated_at) : '—'}
          </dd>
        </div>
      </dl>
    </section>
  )
}
