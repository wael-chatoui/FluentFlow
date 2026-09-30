import Link from 'next/link'
import StatusBadge from '@/components/teacher/StatusBadge'
import Skeleton from '@/components/teacher/Skeleton'
import { accentStyle } from '@/components/ui/accents'
import { formatLessonDate, isStaleGeneration, lessonTitle, parseLocalDate, plural } from '@/components/teacher/format'
import styles from '@/components/teacher/LessonList.module.css'

function sortNewestFirst(lessons) {
  return [...lessons].sort((a, b) => {
    const da = a.lesson_date || ''
    const db = b.lesson_date || ''
    if (da !== db) return da < db ? 1 : -1
    return (b.created_at || '').localeCompare(a.created_at || '')
  })
}

function bestPct(lesson) {
  if (lesson.best_score == null || !lesson.best_total) return null
  const pct = Math.round((Number(lesson.best_score) / Number(lesson.best_total)) * 100)
  return Number.isFinite(pct) ? Math.max(0, Math.min(100, pct)) : null
}

// Bars are colored by score (not by lesson) so red always means "needs work"
function scoreTone(pct) {
  const tone = pct >= 80 ? 'green' : pct >= 50 ? 'orange' : 'red'
  return { '--score': `var(--st-${tone})` }
}

function Footer({ lesson, stale }) {
  if (lesson.status === 'generating') {
    return stale ? (
      <p className={`${styles.note} ${styles.noteOrange}`}>
        <span aria-hidden="true">⏳</span>
        <span className={styles.noteText}>Semble bloquée — ouvre-la pour relancer</span>
      </p>
    ) : (
      <p className={`${styles.note} ${styles.noteBlue}`}>
        <span aria-hidden="true">⏳</span>
        <span className={styles.noteText}>Génération en cours…</span>
      </p>
    )
  }
  if (lesson.status === 'failed') {
    return (
      <p className={`${styles.note} ${styles.noteRed}`} title={lesson.error || undefined}>
        <span aria-hidden="true">⚠️</span>
        <span className={styles.noteText}>{lesson.error || 'La génération a échoué.'}</span>
      </p>
    )
  }
  if (lesson.status !== 'published') return null
  // A failed regeneration keeps the previous version online
  if (lesson.error) {
    return (
      <p className={`${styles.note} ${styles.noteOrange}`} title={lesson.error}>
        <span aria-hidden="true">⚠️</span>
        <span className={styles.noteText}>Dernière régénération échouée (l&apos;ancienne version reste en ligne)</span>
      </p>
    )
  }
  if (lesson.hidden) {
    return (
      <p className={`${styles.note} ${styles.noteOrange}`}>
        <span aria-hidden="true">🙈</span>
        <span className={styles.noteText}>Invisible pour l&apos;élève — à relire puis publier</span>
      </p>
    )
  }

  const pct = bestPct(lesson)
  const attempts = lesson.attempts || 0
  if (pct === null) {
    return (
      <p className={styles.note}>
        <span aria-hidden="true">🌱</span>
        <span className={styles.noteText}>Pas encore pratiquée</span>
      </p>
    )
  }
  return (
    <div className={styles.progress} style={scoreTone(pct)}>
      <span className={styles.track} aria-hidden="true">
        <span className={styles.fill} style={{ width: `${Math.max(pct, 4)}%` }} />
      </span>
      <span className={styles.score}>
        Meilleur score <strong>{lesson.best_score}/{lesson.best_total}</strong>
        <span className={styles.attempts}> · {plural(attempts, 'tentative')}</span>
      </span>
    </div>
  )
}

/**
 * Lessons of one student, newest first, each card linking to the teacher lesson page.
 * Status pill: Publiée / Brouillon (hidden) / En cours / Bloquée (the API's `stale` flag) /
 * Échec, plus « Importée » for lessons made from an imported document (source_kind).
 */
export default function LessonList({ lessons }) {
  const sorted = sortNewestFirst(lessons || [])
  const now = Date.now()

  return (
    <ul className={styles.list}>
      {sorted.map((lesson, i) => {
        const date = parseLocalDate(lesson.lesson_date)
        const title = lessonTitle(lesson)
        const count = lesson.exercise_count || 0
        // The API flag wins (server clock); updated_at is only the fallback
        const stale = isStaleGeneration(lesson, now)
        return (
          <li key={lesson.id} className={styles.item} style={{ ...accentStyle(lesson.id), '--i': Math.min(i, 6) }}>
            <Link href={`/teacher/lessons/${lesson.id}`} className={styles.card}>
              <span className={styles.tile} aria-hidden="true">
                {date ? (
                  <>
                    <span className={styles.day}>{date.getDate()}</span>
                    <span className={styles.month}>
                      {date.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '')}
                    </span>
                  </>
                ) : (
                  <span className={styles.day}>—</span>
                )}
              </span>

              <span className={styles.body}>
                <span className={styles.top}>
                  <time className={styles.date} dateTime={lesson.lesson_date || undefined}>
                    {formatLessonDate(lesson.lesson_date)}
                  </time>
                  <StatusBadge status={lesson.status} hidden={lesson.hidden} stale={stale} />
                  {lesson.source_kind === 'import' && <span className={styles.kind}>Importée</span>}
                </span>
                <span className={styles.title}>{title}</span>
                {lesson.status === 'published' && (
                  <span className={styles.meta}>
                    {count > 0 ? plural(count, 'exercice') : 'Aucun exercice'}
                  </span>
                )}
              </span>

              <span className={styles.footer}>
                <Footer lesson={lesson} stale={stale} />
                <span className={styles.chevron} aria-hidden="true">›</span>
              </span>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

export function LessonListSkeleton({ rows = 3 }) {
  return (
    <ul className={styles.list} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className={styles.item}>
          <div className={`${styles.card} ${styles.skeleton}`}>
            <Skeleton width={52} height={52} radius={14} />
            <span className={styles.body}>
              <Skeleton width="35%" height={12} />
              <Skeleton width="75%" height={18} style={{ marginTop: 8 }} />
              <Skeleton width="30%" height={12} style={{ marginTop: 8 }} />
            </span>
            <span className={styles.footer}>
              <Skeleton height={12} radius={999} style={{ flex: 1 }} />
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
