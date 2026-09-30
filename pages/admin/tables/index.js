import Link from 'next/link'
import AdminShell from '@/components/admin/AdminShell'
import useAdminQuery from '@/components/admin/common/useAdminQuery'
import { cx, formatNumber } from '@/components/admin/common/format'
import { tableIcon } from '@/components/admin/tables/tableMeta'
import admin from '@/components/admin/common/admin.module.css'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/admin/tables/tables.module.css'
import { RefreshCw } from 'lucide-react'
import Icon from '@/components/ui/Icon'

export default function AdminTablesPage() {
  const { data, error, loading, reload } = useAdminQuery('/api/admin/tables')
  const tables = data?.tables || []

  return (
    <AdminShell
      title="Tables"
      actions={
        <button type="button" className={cx(ui.btn, ui.small, admin.tap, admin.blueGhost)} onClick={reload} disabled={loading}>
          <Icon icon={RefreshCw} size={16} /> Actualiser
        </button>
      }
    >
      <p className={cx(admin.sectionSub, styles.intro)}>
        Explorateur en lecture seule de la base de données. Les modifications se font depuis les pages Utilisateurs et
        Leçons.
      </p>

      {error && (
        <div className={admin.alert} role="alert">
          <span className={admin.alertText}>{error}</span>
          <button type="button" className={cx(ui.btn, ui.small, admin.tap)} onClick={reload}>
            Réessayer
          </button>
        </div>
      )}

      {loading && tables.length === 0 ? (
        <ul className={styles.cards} aria-busy="true" aria-label="Chargement des tables">
          {Array.from({ length: 9 }, (_, i) => (
            <li key={i}>
              <span className={cx(ui.skel, styles.cardSkel)} />
            </li>
          ))}
        </ul>
      ) : (
        <ul className={styles.cards}>
          {tables.map((t) => {
            const inner = (
              <>
                <span className={styles.cardIcon} aria-hidden="true">
                  <Icon icon={tableIcon(t.name)} size={22} />
                </span>
                <span className={styles.cardText}>
                  <strong className={styles.cardLabel}>{t.label || t.name}</strong>
                  <span className={cx(admin.mono, admin.muted)}>{t.name}</span>
                  {t.unavailable && (
                    <span className={styles.cardMissing}>
                      {t.unavailable === 'forbidden'
                        ? 'Inaccessible : droits du rôle service_role manquants'
                        : 'Absente : migration 0006 à appliquer'}
                    </span>
                  )}
                </span>
                {!t.unavailable && (
                  <span className={styles.cardCount}>
                    {formatNumber(t.count)}
                    <span className={styles.cardCountLabel}> ligne{t.count > 1 ? 's' : ''}</span>
                  </span>
                )}
              </>
            )
            return (
              <li key={t.name}>
                {t.unavailable ? (
                  <div className={cx(styles.card, styles.cardDisabled)}>{inner}</div>
                ) : (
                  <Link href={`/admin/tables/${encodeURIComponent(t.name)}`} className={styles.card}>
                    {inner}
                  </Link>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </AdminShell>
  )
}
