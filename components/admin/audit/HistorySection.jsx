import { useId } from 'react'
import Link from 'next/link'
import DataTable from '@/components/admin/common/DataTable'
import StatusPill from '@/components/admin/common/StatusPill'
import useAdminQuery from '@/components/admin/common/useAdminQuery'
import { cx, formatDateTime, formatNumber, formatRelative } from '@/components/admin/common/format'
import { ActionPill, DetailsCell } from '@/components/admin/audit/AuditCells'
import { toQueryString } from '@/components/admin/tables/useUrlQuery'
import ui from '@/components/ui/ui.module.css'
import s from '@/components/admin/common/admin.module.css'
import { ArrowRight, ScrollText } from 'lucide-react'
import Icon from '@/components/ui/Icon'

const LIMIT = 10

const COLUMNS = [
  {
    key: 'created_at',
    label: 'Date',
    render: (row) => (
      <time className={s.nowrap} dateTime={row.created_at} title={formatDateTime(row.created_at)}>
        {formatRelative(row.created_at)}
      </time>
    ),
  },
  { key: 'action', label: 'Action', primary: true, render: (row) => <ActionPill action={row.action} /> },
  { key: 'admin_email', label: 'Par', render: (row) => <span className={s.cellSub}>{row.admin_email || '—'}</span> },
  { key: 'details', label: 'Détails', render: (row) => <DetailsCell details={row.details} /> },
]

/**
 * « Historique »: the latest back-office actions on one user or lesson (audit log).
 * @param {{ entity: 'user'|'lesson', entityId: string, refreshKey?: unknown }} props
 *   refreshKey: change it after a write to reload the list
 */
export default function HistorySection({ entity, entityId, refreshKey }) {
  const uid = useId()
  const url = entityId ? `/api/admin/audit${toQueryString({ entity, entityId, perPage: LIMIT })}` : null
  const { data, error, loading, reload } = useAdminQuery(url, [refreshKey])
  const total = data?.total ?? 0

  return (
    <section className={s.section} aria-labelledby={uid}>
      <div className={s.sectionHead}>
        <h2 id={uid} className={s.sectionTitle}>
          <Icon icon={ScrollText} size={20} /> Historique
          {data && <StatusPill tone="gray">{formatNumber(total)}</StatusPill>}
        </h2>
        {total > LIMIT && (
          <Link href={`/admin/audit${toQueryString({ entity, entityId })}`} className={s.link}>
            Tout voir <Icon icon={ArrowRight} size={16} />
          </Link>
        )}
      </div>
      {error ? (
        <div className={s.alert} role="alert">
          <span className={s.alertText}>Historique indisponible : {error}</span>
          <button type="button" className={cx(ui.btn, ui.small, s.tap)} onClick={reload}>
            Réessayer
          </button>
        </div>
      ) : (
        <DataTable
          columns={COLUMNS}
          rows={data?.entries || []}
          loading={loading}
          caption="Dernières actions du back office"
          maxHeight="360px"
          empty="Aucune modification faite depuis le back office."
        />
      )}
    </section>
  )
}
