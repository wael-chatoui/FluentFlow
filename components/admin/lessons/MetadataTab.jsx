import { useId } from 'react'
import { safeDriveUrl } from '@/utils/lesson/schema'
import { cx, formatDateTime } from '@/components/admin/common/format'
import { Field, TextField } from '@/components/admin/lessons/fields'
import StudentSelect from '@/components/admin/lessons/StudentSelect'
import { LESSON_STATUS_LABELS } from '@/components/admin/lessons/constants'
import { LIMITS } from '@/components/admin/lessons/editorModel'
import admin from '@/components/admin/common/admin.module.css'
import styles from '@/components/admin/lessons/editor.module.css'
import { ExternalLink, Info } from 'lucide-react'
import Icon from '@/components/ui/Icon'

// What the chosen status does (the server sets `error` with a status change)
function statusHint(draft, lesson) {
  if (draft.status === 'generating') return 'Génération bloquée : choisis « Publiée » ou « Échec » pour la débloquer.'
  if (draft.status !== lesson.status && draft.status === 'published' && lesson.error) {
    return 'L’erreur de génération sera effacée à l’enregistrement.'
  }
  return '« En génération » ne peut pas être choisi à la main.'
}

/**
 * "Métadonnées" tab: title, date, status, visibility, student, Drive link + read-only facts.
 * `hasResults`: the lesson has practice / review results, so it cannot change student.
 * Visibility words follow the teacher area: hidden = « Brouillon ».
 */
export default function MetadataTab({ draft, lesson, onChange, errors, onCopy, hasResults }) {
  const uid = useId()
  const set = (key) => (value) => onChange({ [key]: value })
  const driveOk = draft.driveUrl.trim() && safeDriveUrl(draft.driveUrl)

  return (
    <div className={admin.stack}>
      <section className={admin.section}>
        <div className={styles.fields}>
          <TextField
            label="Titre de la leçon"
            value={draft.title}
            maxLength={LIMITS.title}
            error={errors.title}
            onChange={set('title')}
          />
          <div className={styles.grid2}>
            <TextField
              label="Date de la leçon"
              type="date"
              value={draft.lessonDate}
              error={errors.lessonDate}
              onChange={set('lessonDate')}
            />
            <Field label="Statut" error={errors.status} hint={statusHint(draft, lesson)}>
              {(props) => (
                <select
                  {...props}
                  className={cx(props.className, admin.select)}
                  value={draft.status}
                  onChange={(e) => set('status')(e.target.value)}
                >
                  {draft.status === 'generating' && (
                    <option value="generating" disabled>
                      {LESSON_STATUS_LABELS.generating}
                    </option>
                  )}
                  <option value="published">{LESSON_STATUS_LABELS.published}</option>
                  <option value="failed">{LESSON_STATUS_LABELS.failed}</option>
                </select>
              )}
            </Field>
          </div>
          <div className={admin.field}>
            <label className={admin.check}>
              <input
                type="checkbox"
                role="switch"
                checked={!draft.hidden}
                onChange={(e) => set('hidden')(!e.target.checked)}
                aria-describedby={`${uid}-visibility`}
              />
              <span>Visible dans l’espace élève</span>
            </label>
            <p id={`${uid}-visibility`} className={admin.hint}>
              {draft.hidden
                ? 'Brouillon : l’élève ne la voit pas (à relire avant de la publier, ou retirée de son espace).'
                : 'Publiée pour l’élève : il la voit dans son espace dès qu’elle est générée.'}
            </p>
          </div>
          <StudentSelect
            value={draft.studentId}
            fallbackName={lesson.student_name}
            error={errors.studentId}
            onChange={set('studentId')}
            locked={
              hasResults
                ? 'Impossible de changer d’élève : cette leçon a déjà des résultats (entraînements ou révisions). Supprime-la et recrée-la pour l’autre élève.'
                : null
            }
          />
          <Field
            label="Lien Google Drive"
            error={errors.driveUrl}
            hint="Lien https vers drive.google.com ou docs.google.com (vide = aucun)."
          >
            {(props) => (
              <div className={styles.inline}>
                <input
                  {...props}
                  type="url"
                  inputMode="url"
                  value={draft.driveUrl}
                  maxLength={2000}
                  placeholder="https://drive.google.com/…"
                  onChange={(e) => set('driveUrl')(e.target.value)}
                />
                {driveOk && (
                  <a href={driveOk} target="_blank" rel="noopener noreferrer" className={styles.insertBtn}>
                    Ouvrir <Icon icon={ExternalLink} size={15} />
                  </a>
                )}
              </div>
            )}
          </Field>
        </div>
      </section>

      <section className={admin.section}>
        <div className={admin.sectionHead}>
          <h2 className={admin.sectionTitle}>
            <Icon icon={Info} size={20} /> Informations
          </h2>
        </div>
        <dl className={styles.facts}>
          <div>
            <dt>Identifiant</dt>
            <dd>
              <span className={admin.mono}>{lesson.id}</span>{' '}
              <button type="button" className={styles.linkBtn} onClick={() => onCopy(lesson.id, 'Identifiant copié.')}>
                Copier
              </button>
            </dd>
          </div>
          <div>
            <dt>Créée</dt>
            <dd>{formatDateTime(lesson.created_at)}</dd>
          </div>
          <div>
            <dt>Modifiée</dt>
            <dd>{formatDateTime(lesson.updated_at)}</dd>
          </div>
          <div>
            <dt>Générée</dt>
            <dd>{formatDateTime(lesson.generated_at)}</dd>
          </div>
        </dl>
        {lesson.error && (
          <div className={cx(admin.alert, styles.mTop)}>
            <span className={admin.alertText}>
              <strong>
                {lesson.status === 'published'
                  ? 'Dernière régénération échouée (la version précédente reste en ligne) :'
                  : 'Erreur de génération :'}
              </strong>{' '}
              {lesson.error}
            </span>
          </div>
        )}
      </section>
    </div>
  )
}
