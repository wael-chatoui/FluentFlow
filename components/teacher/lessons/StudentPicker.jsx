import Link from 'next/link'
import { initialsOf, levelBadgeText, studentDisplayName } from '@/components/teacher/format'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/lessons/StudentPicker.module.css'

// Up to this many students: selectable chips; more: a big select
export const CHIP_LIMIT = 8

/**
 * Student selector of the "new lesson" form. Both variants call `onChange`
 * with a change event whose `target.value` is the student id.
 * @param {{ id: string, labelledBy: string, students: object[] | null, error?: string | null,
 *   value: string, onChange: (e: { target: { value: string } }) => void, onRetry: () => void,
 *   invalid?: boolean, describedBy?: string, disabled?: boolean }} props
 *   `id` goes on the focusable control (select, or first radio) so the form can focus it.
 */
export default function StudentPicker({
  id,
  labelledBy,
  students,
  error,
  value,
  onChange,
  onRetry,
  invalid = false,
  describedBy,
  disabled = false,
}) {
  if (!students) {
    if (error) {
      return (
        <div className={`${bits.alert} ${bits.error}`} role="alert">
          <span className={bits.alertIcon} aria-hidden="true">😕</span>
          <div className={bits.alertBody}>
            <span>{error}</span>
            <div className={bits.alertActions}>
              <button type="button" className={`${ui.btn} ${ui.small} ${bits.tap}`} onClick={onRetry}>
                Réessayer
              </button>
            </div>
          </div>
        </div>
      )
    }
    return (
      <div className={styles.loading} role="status">
        <span className="sr-only">Chargement des élèves…</span>
        <span className={`${ui.skel} ${styles.skelChip}`} aria-hidden="true" />
        <span className={`${ui.skel} ${styles.skelChip}`} aria-hidden="true" />
        <span className={`${ui.skel} ${styles.skelChip} ${styles.skelShort}`} aria-hidden="true" />
      </div>
    )
  }

  if (students.length === 0) {
    return (
      <p className={styles.none}>
        <span aria-hidden="true">👋 </span>
        Aucun élève pour l&apos;instant.{' '}
        <Link href="/teacher?invite=1" className={styles.noneLink}>
          Invite ton premier élève
        </Link>{' '}
        : il apparaîtra ici dès que son compte sera créé.
      </p>
    )
  }

  if (students.length > CHIP_LIMIT) {
    return (
      <select
        id={id}
        aria-labelledby={labelledBy}
        className={`${bits.select} ${styles.bigSelect} ${invalid ? bits.invalid : ''}`}
        value={value}
        onChange={onChange}
        disabled={disabled}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
      >
        <option value="">Choisir un élève…</option>
        {students.map((s) => (
          <option key={s.id} value={s.id}>
            {studentDisplayName(s)}
            {s.full_name?.trim() ? ` (${s.email})` : ''}
          </option>
        ))}
      </select>
    )
  }

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={`${styles.chips} ${invalid ? styles.chipsInvalid : ''}`}
    >
      {students.map((s, i) => {
        const name = studentDisplayName(s)
        const level = levelBadgeText(s.level)
        const checked = value === s.id
        return (
          <label key={s.id} className={`${styles.chip} ${checked ? styles.checked : ''}`} title={s.email || undefined}>
            <input
              type="radio"
              id={i === 0 ? id : undefined}
              name={`${id}-radio`}
              value={s.id}
              checked={checked}
              onChange={onChange}
              disabled={disabled}
              className={styles.radio}
            />
            <span className={styles.avatar} aria-hidden="true">
              {checked ? '✓' : initialsOf(name)}
            </span>
            <span className={styles.name}>{name}</span>
            {level && <span className={styles.level}>{level}</span>}
          </label>
        )
      })}
    </div>
  )
}
