import { forwardRef } from 'react'
import Link from 'next/link'
import { plural } from '@/components/teacher/format'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/teacher/import/Import.module.css'

/**
 * End-of-run card: counts + "Voir la fiche de l'élève" / "Importer d'autres documents".
 * @param {{ published: number, failed: number, skipped: number, studentId: string,
 *   onMore: () => void }} props
 */
const ImportSummary = forwardRef(function ImportSummary(
  { published, failed, skipped, studentId, onMore },
  ref
) {
  const allGood = failed === 0 && skipped === 0 && published > 0
  const none = published === 0
  const tone = allGood ? styles.sumGreen : none ? styles.sumRed : styles.sumOrange
  const emoji = allGood ? '🎉' : none ? '😵' : '💪'
  const title = allGood
    ? published > 1
      ? 'Toutes les leçons sont publiées !'
      : 'La leçon est publiée !'
    : none
      ? "Aucune leçon n'a été publiée"
      : 'Import terminé'

  return (
    <section ref={ref} tabIndex={-1} className={`${styles.summary} ${tone}`} aria-labelledby="import-summary-title">
      <span className={styles.sumIcon} aria-hidden="true">{emoji}</span>
      <div className={styles.sumBody}>
        <h2 id="import-summary-title" className={styles.sumTitle}>{title}</h2>
        <ul className={styles.sumCounts}>
          <li className={styles.countGreen}>
            <span aria-hidden="true">✅</span> {plural(published, 'publiée', 'publiées')}
          </li>
          {failed > 0 && (
            <li className={styles.countRed}>
              <span aria-hidden="true">❌</span> {plural(failed, 'échec', 'échecs')}
            </li>
          )}
          {skipped > 0 && (
            <li className={styles.countGrey}>
              <span aria-hidden="true">⏸️</span> {plural(skipped, 'non traitée', 'non traitées')}
            </li>
          )}
        </ul>
        {(failed > 0 || skipped > 0) && (
          <p className={styles.sumText}>
            {failed > 0 && 'Utilise « Réessayer » sur les documents en échec. '}
            {skipped > 0 && "Les documents non traités sont toujours dans la liste : relance l'import quand tu veux."}
          </p>
        )}
        <div className={styles.sumActions}>
          <Link href={`/teacher/students/${studentId}`} className={`${ui.btn} ${ui.blue}`}>
            Voir la fiche de l&apos;élève
          </Link>
          <button type="button" className={`${ui.btn} ${ui.ghost}`} onClick={onMore}>
            <span aria-hidden="true">📥</span> Importer d&apos;autres documents
          </button>
        </div>
      </div>
    </section>
  )
})

export default ImportSummary
