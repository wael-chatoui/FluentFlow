import { useId, useRef, useState } from 'react'
import Dialog from '@/components/ui/Dialog'
import Icon from '@/components/ui/Icon'
import { Flag, Loader2 } from 'lucide-react'
import styles from './ReportExerciseDialog.module.css'

const DEFAULT_REASONS = [
  "There's a typo or mistake in the text",
  'My answer should have been accepted',
  'The question or explanation is confusing',
  'Other issue',
]

/**
 * Dialog allowing students to report an exercise during practice.
 * Submitting notifies the teacher and temporarily deactivates the exercise.
 * @param {{
 *   exercise: object,
 *   submitting?: boolean,
 *   onClose: () => void,
 *   onSubmit: (params: { reason: string, note: string }) => Promise<void>|void,
 * }} props
 */
export default function ReportExerciseDialog({ exercise, submitting = false, onClose, onSubmit }) {
  const titleId = useId()
  const descId = useId()
  const [selectedReason, setSelectedReason] = useState(DEFAULT_REASONS[0])
  const [note, setNote] = useState('')
  const submitBtnRef = useRef(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    if (submitting) return
    onSubmit({ reason: selectedReason, note: note.trim() })
  }

  return (
    <Dialog
      onClose={onClose}
      busy={submitting}
      role="dialog"
      labelledBy={titleId}
      describedBy={descId}
      initialFocusRef={submitBtnRef}
      className={styles.dialog}
    >
      <div className={styles.head}>
        <span className={styles.iconWrap} aria-hidden="true">
          <Icon icon={Flag} size={22} />
        </span>
        <h2 id={titleId} className={styles.title}>
          Report this exercise
        </h2>
      </div>

      <p id={descId} className={styles.desc}>
        Notice an issue? Wael will be notified so he can review and fix it. This exercise will be temporarily deactivated for you.
      </p>

      <form onSubmit={handleSubmit}>
        <div className={styles.reasonsList} role="radiogroup" aria-label="Reason for report">
          {DEFAULT_REASONS.map((reason) => {
            const isSelected = selectedReason === reason
            return (
              <button
                key={reason}
                type="button"
                role="radio"
                aria-checked={isSelected}
                className={`${styles.reasonBtn} ${isSelected ? styles.reasonSelected : ''}`}
                onClick={() => setSelectedReason(reason)}
                disabled={submitting}
              >
                {reason}
              </button>
            )
          })}
        </div>

        <div className={styles.textareaWrap}>
          <label htmlFor="report-note" className={styles.label}>
            Additional note (optional):
          </label>
          <textarea
            id="report-note"
            className={styles.textarea}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Tell Wael what felt wrong or what you typed..."
            rows={2}
            maxLength={500}
            disabled={submitting}
          />
        </div>

        <div className={styles.actions}>
          <button type="button" className={`${styles.btn} ${styles.btnCancel}`} onClick={onClose} disabled={submitting}>
            Cancel
          </button>
          <button ref={submitBtnRef} type="submit" className={`${styles.btn} ${styles.btnSubmit}`} disabled={submitting}>
            {submitting ? (
              <>
                <Icon icon={Loader2} size={18} className="animate-spin" />
                <span style={{ marginLeft: 8 }}>Sending...</span>
              </>
            ) : (
              'Submit report'
            )}
          </button>
        </div>
      </form>
    </Dialog>
  )
}
