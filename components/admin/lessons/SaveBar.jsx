import { cx } from '@/components/admin/common/format'
import { FIELD_LABELS } from '@/components/admin/lessons/editorModel'
import admin from '@/components/admin/common/admin.module.css'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/admin/lessons/editor.module.css'

/**
 * Sticky bar shown while the draft has unsaved changes. `resetsProgress`: saving
 * restarts the student's progress on the lesson (edited exercises).
 */
export default function SaveBar({ fields, errorCount, saving, resetsProgress, onSave, onReset }) {
  if (fields.length === 0) return null
  return (
    <div className={styles.saveBar} role="region" aria-label="Modifications non enregistrées">
      <div className={styles.saveInfo}>
        <strong>Modifications non enregistrées</strong>
        <span className={styles.saveFields}>
          {fields.map((f) => FIELD_LABELS[f]).join(', ')}
          {errorCount > 0 && (
            <span className={styles.saveErrors}>
              {' '}
              · {errorCount} problème{errorCount > 1 ? 's' : ''} à corriger
            </span>
          )}
          {resetsProgress && errorCount === 0 && (
            <span className={styles.saveWarn}> · la progression de l’élève sur cette leçon repartira de zéro</span>
          )}
        </span>
      </div>
      <div className={styles.saveActions}>
        <button type="button" className={cx(ui.btn, ui.small, admin.tap)} onClick={onReset} disabled={saving}>
          Annuler les modifications
        </button>
        <button type="button" className={cx(ui.btn, ui.small, admin.tap, ui.green)} onClick={onSave} disabled={saving} aria-keyshortcuts="Control+S Meta+S">
          {saving && <span className={admin.spinner} aria-hidden="true" />}
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </div>
  )
}
