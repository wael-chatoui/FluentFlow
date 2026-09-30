import { forwardRef } from 'react'
import Link from 'next/link'
import { plural } from '@/components/teacher/format'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/teacher/import/Import.module.css'
import { CircleAlert, CircleCheck, CircleX, FilePen, Import, PartyPopper, Pause, TriangleAlert } from 'lucide-react'
import Icon from '@/components/ui/Icon'

/**
 * End-of-run card: counts + "Voir la fiche de l'élève" / "Importer d'autres documents".
 * @param {{ published: number, drafts: number, failed: number, skipped: number, studentId: string,
 *   onMore: () => void }} props
 *   `published` includes the `drafts` (lessons ready but hidden until the teacher publishes them).
 */
const ImportSummary = forwardRef(function ImportSummary(
  { published, drafts, failed, skipped, studentId, onMore },
  ref
) {
  const live = published - drafts
  const allGood = failed === 0 && skipped === 0 && published > 0
  const none = published === 0
  const tone = allGood ? styles.sumGreen : none ? styles.sumRed : styles.sumOrange
  const glyph = allGood ? (drafts ? FilePen : PartyPopper) : none ? CircleAlert : TriangleAlert
  let title = 'Import terminé'
  if (none) title = "Aucune leçon n'a été créée"
  else if (allGood && drafts === published) title = published > 1 ? 'Les leçons sont prêtes à relire' : 'La leçon est prête à relire'
  else if (allGood && !drafts) title = published > 1 ? 'Toutes les leçons sont publiées !' : 'La leçon est publiée !'

  return (
    <section ref={ref} tabIndex={-1} className={`${styles.summary} ${tone}`} aria-labelledby="import-summary-title">
      <span className={styles.sumIcon} aria-hidden="true">
        <Icon icon={glyph} size={28} />
      </span>
      <div className={styles.sumBody}>
        <h2 id="import-summary-title" className={styles.sumTitle}>
          {title}
        </h2>
        <ul className={styles.sumCounts}>
          {live > 0 && (
            <li className={styles.countGreen}>
              <Icon icon={CircleCheck} size={14} className={styles.countIcon} /> {plural(live, 'publiée', 'publiées')}
            </li>
          )}
          {drafts > 0 && (
            <li className={styles.countOrange}>
              <Icon icon={FilePen} size={14} className={styles.countIcon} /> {plural(drafts, 'brouillon', 'brouillons')}
            </li>
          )}
          {failed > 0 && (
            <li className={styles.countRed}>
              <Icon icon={CircleX} size={14} className={styles.countIcon} /> {plural(failed, 'échec', 'échecs')}
            </li>
          )}
          {skipped > 0 && (
            <li className={styles.countGrey}>
              <Icon icon={Pause} size={14} className={styles.countIcon} /> {plural(skipped, 'non traitée', 'non traitées')}
            </li>
          )}
        </ul>
        {(drafts > 0 || failed > 0 || skipped > 0) && (
          <p className={styles.sumText}>
            {drafts > 0 && "Les brouillons ne sont pas visibles par l'élève : ouvre chaque leçon et clique « Publier pour l'élève ». "}
            {failed > 0 && 'Clique « Réessayer » sur les documents en échec (ou « Réessayer les échecs » en bas). '}
            {skipped > 0 && "Les documents non traités sont toujours dans la liste : relance l'import quand tu veux."}
          </p>
        )}
        <div className={styles.sumActions}>
          <Link href={`/teacher/students/${studentId}`} className={`${ui.btn} ${ui.blue}`}>
            Voir la fiche de l&apos;élève
          </Link>
          <button type="button" className={`${ui.btn} ${ui.ghost}`} onClick={onMore}>
            <Icon icon={Import} size={18} /> Importer d&apos;autres documents
          </button>
        </div>
      </div>
    </section>
  )
})

export default ImportSummary
