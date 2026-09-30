import Link from 'next/link'
import { safeDriveUrl } from '@/utils/lesson/schema'
import { accentStyle } from '@/components/ui/accents'
import {
  ACCOUNT_STATE_LABELS,
  LEVEL_LABELS,
  accountState,
  initialsOf,
  levelBadgeText,
  studentDisplayName,
} from '@/components/teacher/format'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/teacher/students/StudentHero.module.css'

/**
 * « #plan » / « #compte » shortcuts: scroll to the section and move the focus there, without
 * adding a history entry (a same-page entry makes the browser's Back button stay on this page
 * and ask the unsaved-changes question for nothing). Modified clicks keep the link behaviour.
 */
function jumpTo(e, id) {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
  const target = document.getElementById(id)
  if (!target) return
  e.preventDefault()
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' })
  target.focus({ preventScroll: true })
}

/**
 * Colorful header card of the teacher student page (accent color per student):
 * avatar, name, email, level + account pills, "Nouvelle leçon", "Préparer le prochain
 * cours", "Importer" and Drive folder.
 * @param {{ student: object, newLessonHref: string }} props
 */
export default function StudentHero({ student, newLessonHref }) {
  const name = studentDisplayName(student)
  const hasName = Boolean(student.full_name?.trim())
  const level = levelBadgeText(student.level)
  const driveUrl = safeDriveUrl(student.drive_folder_url)
  const state = accountState(student)

  return (
    <section className={styles.hero} style={accentStyle(student.id)} aria-labelledby="student-name">
      <div className={styles.identity}>
        <span className={styles.avatar} aria-hidden="true">{initialsOf(name)}</span>
        <div className={styles.text}>
          <h1 id="student-name" className={styles.name}>{name}</h1>
          <p className={`${styles.email} ${hasName ? '' : styles.emailMissing}`}>
            {hasName ? student.email : 'Nom non renseigné'}
          </p>
        </div>
      </div>

      <div className={styles.pills}>
        <span className={`${styles.pill} ${level ? styles.pillLevel : ''}`}>
          <span aria-hidden="true">🇫🇷</span>
          <span className="sr-only">Niveau : </span>
          {LEVEL_LABELS[student.level] || LEVEL_LABELS.unknown}
        </span>
        {state === 'active' ? (
          <span className={`${styles.pill} ${styles.pillOk}`}>
            <span aria-hidden="true">{ACCOUNT_STATE_LABELS.active.icon}</span> {ACCOUNT_STATE_LABELS.active.label}
          </span>
        ) : (
          <a href="#compte" className={`${styles.pill} ${styles.pillPending}`} onClick={(e) => jumpTo(e, 'compte')}>
            <span aria-hidden="true">{ACCOUNT_STATE_LABELS[state].icon}</span> {ACCOUNT_STATE_LABELS[state].label}
          </a>
        )}
      </div>

      <div className={styles.actions}>
        <Link href={newLessonHref} className={`${ui.btn} ${ui.green} ${styles.primary}`}>
          <span aria-hidden="true">✨</span> Nouvelle leçon
        </Link>
        <a href="#plan" className={`${ui.btn} ${ui.ghost} ${styles.secondary}`} onClick={(e) => jumpTo(e, 'plan')}>
          <span aria-hidden="true">🗺️</span> Préparer le prochain cours
        </a>
        <Link
          href={`/teacher/lessons/import?student=${encodeURIComponent(student.id)}`}
          className={`${ui.btn} ${ui.ghost} ${styles.secondary}`}
        >
          <span aria-hidden="true">📥</span> Importer des leçons
        </Link>
        {driveUrl && (
          <a
            href={driveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`${ui.btn} ${ui.ghost} ${styles.secondary}`}
          >
            <span aria-hidden="true">📁</span> Dossier Drive
            <span className="sr-only"> (nouvel onglet)</span>
          </a>
        )}
      </div>
    </section>
  )
}

/** Loading placeholder with the same footprint (accent vars optional via `style`). */
export function StudentHeroSkeleton({ style }) {
  return (
    <div className={`${styles.hero} ${styles.skeleton}`} style={style} aria-hidden="true">
      <div className={styles.identity}>
        <span className={`${ui.skel} ${styles.avatarSkel}`} />
        <div className={styles.text}>
          <span className={ui.skel} style={{ width: '60%', height: 26 }} />
          <span className={ui.skel} style={{ width: '45%', height: 14, marginTop: 10 }} />
        </div>
      </div>
      <div className={styles.pills}>
        <span className={ui.skel} style={{ width: 150, height: 30, borderRadius: 999 }} />
        <span className={ui.skel} style={{ width: 90, height: 30, borderRadius: 999 }} />
      </div>
      <div className={styles.actions}>
        <span className={`${ui.skel} ${styles.primary}`} style={{ height: 52, borderRadius: 16 }} />
      </div>
    </div>
  )
}
