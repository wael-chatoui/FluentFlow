import { useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import AdminShell from '@/components/admin/AdminShell'
import DataTable from '@/components/admin/common/DataTable'
import Pagination from '@/components/admin/common/Pagination'
import SearchInput from '@/components/admin/common/SearchInput'
import FilterChips from '@/components/admin/common/FilterChips'
import StatusPill from '@/components/admin/common/StatusPill'
import { ToastViewport } from '@/components/admin/common/Toast'
import useAdminQuery from '@/components/admin/common/useAdminQuery'
import { formatDate, formatNumber, formatRelative, formatDateTime } from '@/components/admin/common/format'
import useUrlQuery, { toPage, toQueryString } from '@/components/admin/tables/useUrlQuery'
import { LESSON_STATUS_FILTERS, lessonTitle } from '@/components/admin/lessons/constants'
import admin from '@/components/admin/common/admin.module.css'
import ui from '@/components/ui/ui.module.css'

const PER_PAGE = 50
const DEFAULTS = { q: '', status: '', page: '1' }

const stop = (e) => e.stopPropagation()

const COLUMNS = [
  {
    key: 'lesson_date',
    label: 'Date',
    width: '120px',
    render: (row) => <span className={admin.nowrap}>{formatDate(row.lesson_date)}</span>,
  },
  {
    key: 'title',
    label: 'Titre',
    render: (row) => <span className={admin.cellStrong}>{lessonTitle(row)}</span>,
  },
  {
    key: 'student_name',
    label: 'Élève',
    render: (row) =>
      row.student_id ? (
        <Link href={`/admin/users/${row.student_id}`} className={admin.link} onClick={stop}>
          {row.student_name || 'Élève'}
        </Link>
      ) : (
        <span className={admin.muted}>—</span>
      ),
  },
  { key: 'status', label: 'Statut', render: (row) => <StatusPill status={row.status} /> },
  {
    key: 'exercise_count',
    label: 'Exercices',
    align: 'right',
    render: (row) => <span className={admin.num}>{formatNumber(row.exercise_count ?? 0)}</span>,
  },
  {
    key: 'ai_model',
    label: 'Modèle IA',
    render: (row) => (row.ai_model ? <span className={admin.mono}>{row.ai_model}</span> : <span className={admin.muted}>—</span>),
  },
  {
    key: 'created_at',
    label: 'Créée',
    render: (row) => (
      <span className={admin.nowrap} title={formatDateTime(row.created_at)}>
        {formatRelative(row.created_at)}
      </span>
    ),
  },
  {
    key: 'updated_at',
    label: 'Maj',
    render: (row) => (
      <span className={admin.nowrap} title={formatDateTime(row.updated_at)}>
        {formatRelative(row.updated_at)}
      </span>
    ),
  },
]

export default function AdminLessonsPage() {
  const router = useRouter()
  const { ready, params, setParams } = useUrlQuery(DEFAULTS)
  const page = toPage(params.page)

  const url = ready
    ? `/api/admin/lessons${toQueryString({ q: params.q.trim(), status: params.status, page, perPage: PER_PAGE })}`
    : null
  const { data, error, loading, reload } = useAdminQuery(url)

  const rows = useMemo(() => data?.lessons || [], [data])
  const total = data?.total ?? 0

  return (
    <AdminShell
      title="Leçons"
      actions={
        <button type="button" className={`${ui.btn} ${ui.small} ${admin.tap} ${admin.blueGhost}`} onClick={reload} disabled={loading}>
          <span aria-hidden="true">↻</span> Actualiser
        </button>
      }
    >
      <div className={admin.stack}>
        <div className={admin.toolbar}>
          <div className={admin.search}>
            <SearchInput
              value={params.q}
              onChange={(q) => setParams({ q, page: '1' })}
              placeholder="Rechercher un titre, un élève…"
              label="Rechercher une leçon"
            />
          </div>
          <FilterChips
            label="Filtrer par statut"
            options={LESSON_STATUS_FILTERS}
            value={params.status}
            onChange={(status) => setParams({ status, page: '1' })}
          />
        </div>

        {error && (
          <div className={admin.alert} role="alert">
            <span className={admin.alertText}>{error}</span>
            <button type="button" className={`${ui.btn} ${ui.small} ${admin.tap}`} onClick={reload}>
              Réessayer
            </button>
          </div>
        )}

        <DataTable
          columns={COLUMNS}
          rows={rows}
          loading={loading}
          empty={params.q || params.status ? 'Aucune leçon ne correspond à ces filtres.' : 'Aucune leçon pour le moment.'}
          onRowClick={(row) => router.push(`/admin/lessons/${row.id}`)}
        />

        <Pagination page={page} perPage={PER_PAGE} total={total} onPage={(p) => setParams({ page: String(p) })} />
      </div>
      <ToastViewport />
    </AdminShell>
  )
}
