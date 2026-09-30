import { useId } from 'react'
import styles from '@/components/teacher/import/ReviewOption.module.css'

// Same preference as the "Nouvelle leçon" page
const STORAGE_KEY = 'teacher.reviewBeforePublish'

/** « Relire avant de publier » remembered in this browser ('1' / '0'). */
export function readReviewPreference() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY)
    return value === '1' || value === 'true'
  } catch {
    return false
  }
}

export function writeReviewPreference(on) {
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0')
  } catch {
    // Storage disabled: the choice only lasts for this visit
  }
}

/**
 * « Relire avant de publier » checkbox: the imported lessons are created as drafts
 * the student cannot see until the teacher publishes them from the lesson page.
 * @param {{ checked: boolean, onChange: (checked: boolean) => void, disabled?: boolean }} props
 */
export default function ReviewOption({ checked, onChange, disabled = false }) {
  const uid = useId()
  return (
    <div className={`${styles.option} ${checked ? styles.on : ''}`}>
      <input
        id={`${uid}-review`}
        type="checkbox"
        className={styles.box}
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        aria-describedby={`${uid}-review-hint`}
      />
      <div className={styles.text}>
        <label htmlFor={`${uid}-review`} className={styles.label}>
          Relire avant de publier
        </label>
        <p id={`${uid}-review-hint`} className={styles.hint}>
          {checked
            ? "Les leçons seront créées en brouillon : l'élève ne les verra qu'après « Publier pour l'élève » sur chaque leçon."
            : "Les leçons seront visibles par l'élève dès qu'elles sont prêtes."}
        </p>
      </div>
    </div>
  )
}
