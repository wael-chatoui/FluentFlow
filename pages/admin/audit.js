import { useEffect, useMemo, useState } from 'react'
import AdminShell from '@/components/admin/AdminShell'
import DataTable from '@/components/admin/common/DataTable'
import FilterChips from '@/components/admin/common/FilterChips'
import Pagination from '@/components/admin/common/Pagination'
import useAdminQuery from '@/components/admin/common/useAdminQuery'
import { cx, formatDateTime, formatNumber, formatRelative } from '@/components/admin/common/format'
import useUrlQuery, { toPage, toQueryString } from '@/components/admin/tables/useUrlQuery'
import {
  ActionPill,
  DetailsCell,
  ENTITY_LABELS,
  EntityCell,
  KNOWN_ACTIONS,
  KNOWN_ENTITIES,
} from '@/components/admin/audit/AuditCells'
import admin from '@/components/admin/common/admin.module.css'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/admin/audit/audit.module.css'

const PER_PAGE = 50
const DEFAULTS = { action: '', entity: '', page: '1' }

const COLUMNS = [
  {
    key: 'created_at',
    label: 'Date',
    width: '140px',
    render: (row) => (
      <time className={admin.nowrap} dateTime={row.created_at} title={formatDateTime(row.created_at)}>
        {formatRelative(row.created_at)}
      </time>
    ),
  },
  { key: 'action', label: 'Action', primary: true, render: (row) => <ActionPill action={row.action} /> },
  {
    key: 'admin_email',
    label: 'Admin',
    render: (row) => <span className={admin.cellSub}>{row.admin_email || '—'}</span>,
  },
  { key: 'entity', label: 'Entité', render: (row) => <EntityCell entry={row} /> },
  { key: 'details', label: 'Détails', render: (row) => <DetailsCell details={row.details} /> },
]

function chipOptions(values, allLabel, labels = {}) {
  return [{ value: '', label: allLabel }, ...values.map((v) => ({ value: v, label: labels[v] || v }))]
}

export default function AdminAuditPage() {
  const { ready, params, setParams } = useUrlQuery(DEFAULTS)
  const page = toPage(params.page)

  const url = ready
    ? `/api/admin/audit${toQueryString({ action: params.action, entity: params.entity, page, perPage: PER_PAGE })}`
    : null
  const { data, error, loading, reload } = useAdminQuery(url)
  const entries = useMemo(() => data?.entries || [], [data])

  // Filter chips = known values + everything seen in the log so far
  const [seen, setSeen] = useState({ actions: KNOWN_ACTIONS, entities: KNOWN_ENTITIES })
  useEffect(() => {
    setSeen((prev) => {
      const actions = new Set(prev.actions)
      const entities = new Set(prev.entities)
      entries.forEach((e) => {
        if (e.action) actions.add(e.action)
        if (e.entity) entities.add(e.entity)
      })
      if (params.action) actions.add(params.action)
      if (params.entity) entities.add(params.entity)
      if (actions.size === prev.actions.length && entities.size === prev.entities.length) return prev
      return { actions: [...actions].sort(), entities: [...entities].sort() }
    })
  }, [entries, params.action, params.entity])

  const filtered = Boolean(params.action || params.entity)

  return (
    <AdminShell
      title="Journal"
      actions={
        <button type="button" className={cx(ui.btn, ui.small, admin.tap, admin.blueGhost)} onClick={reload} disabled={loading}>
          <span aria-hidden="true">↻</span> Actualiser
        </button>
      }
    >
      <div className={admin.stack}>
        <div className={cx(admin.section, styles.filters)}>
          <div className={styles.filterRow}>
            <span className={styles.filterLabel} aria-hidden="true">
              Entité
            </span>
            <FilterChips
              label="Filtrer par entité"
              options={chipOptions(seen.entities, 'Toutes', ENTITY_LABELS)}
              value={params.entity}
              onChange={(entity) => setParams({ entity, page: '1' })}
            />
          </div>
          <div className={styles.filterRow}>
            <span className={styles.filterLabel} aria-hidden="true">
              Action
            </span>
            <FilterChips
              label="Filtrer par action"
              options={chipOptions(seen.actions, 'Toutes')}
              value={params.action}
              onChange={(action) => setParams({ action, page: '1' })}
            />
          </div>
          <div className={styles.filterRow}>
            <span className={admin.sectionSub} role="status">
              {data ? `${formatNumber(data.total ?? 0)} entrée${(data.total ?? 0) > 1 ? 's' : ''}` : 'Chargement…'}
            </span>
            {filtered && (
              <button
                type="button"
                className={cx(ui.btn, ui.small, admin.tap, admin.blueGhost)}
                onClick={() => setParams({ action: '', entity: '', page: '1' })}
              >
                Effacer les filtres
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className={admin.alert} role="alert">
            <span className={admin.alertText}>{error}</span>
            <button type="button" className={cx(ui.btn, ui.small, admin.tap)} onClick={reload}>
              Réessayer
            </button>
          </div>
        )}

        <DataTable
          columns={COLUMNS}
          rows={entries}
          loading={loading}
          caption="Journal des actions du back office"
          empty={filtered ? 'Aucune entrée pour ces filtres.' : 'Aucune action enregistrée pour le moment.'}
        />

        <Pagination page={page} perPage={PER_PAGE} total={data?.total ?? 0} onPage={(p) => setParams({ page: String(p) })} />
      </div>
    </AdminShell>
  )
}
