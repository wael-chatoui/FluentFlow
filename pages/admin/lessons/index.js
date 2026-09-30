import { useEffect, useMemo } from 'react'
import Link from 'next/link'
import AdminShell from '@/components/admin/AdminShell'
import DataTable from '@/components/admin/common/DataTable'
import Pagination from '@/components/admin/common/Pagination'
import SearchInput from '@/components/admin/common/SearchInput'
import FilterChips from '@/components/admin/common/FilterChips'
import { LessonStatusPills } from '@/components/admin/common/StatusPill'
import { ToastViewport } from '@/components/admin/common/Toast'
import useAdminQuery from '@/components/admin/common/useAdminQuery'
import { cx, formatDate, formatNumber, formatRelative, formatDateTime, isValidId } from '@/components/admin/common/format'
import useUrlQuery, { toPage, toQueryString } from '@/components/admin/tables/useUrlQuery'
import { LESSON_STATUS_FILTERS, lessonTitle } from '@/components/admin/lessons/constants'
import { isStaleGeneration } from '@/utils/lesson/schema'
import admin from '@/components/admin/common/admin.module.css'
import ui from '@/components/ui/ui.module.css'
import { RefreshCw, X } from 'lucide-react'
import Icon from '@/components/ui/Icon'

const PER_PAGE = 50
const DEFAULTS = { q: '', status: '', studentId: '', page: '1' }

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
    primary: true,
    render: (row) => <span className={admin.cellStrong}>{lessonTitle(row)}</span>,
  },
  {
    key: 'student_name',
    label: 'Élève',
    render: (row) =>
      row.student_id ? (
        <Link href={`/admin/users/${row.student_id}`} className={admin.link}>
          {row.student_name || 'Élève'}
        </Link>
      ) : (
        <span className={admin.muted}>—</span>
      ),
  },
  {
    key: 'status',
    label: 'Statut',
    render: (row) => <LessonStatusPills lesson={{ ...row, stale: isStaleGeneration(row) }} />,
  },
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
  const { ready, params, setParams } = useUrlQuery(DEFAULTS)
  const page = toPage(params.page)
  const studentId = isValidId(params.studentId) ? params.studentId : ''

  const url = ready
    ? `/api/admin/lessons${toQueryString({ q: params.q.trim(), status: params.status, studentId, page, perPage: PER_PAGE })}`
    : null
  const { data, error, loading, reload } = useAdminQuery(url)

  // The server clamps a page past the end (bookmarked URL, deleted rows): follow it
  useEffect(() => {
    if (data?.page && data.page !== page && !loading && !error) setParams({ page: String(data.page) })
  }, [data, page, loading, error, setParams])

  const rows = useMemo(() => data?.lessons || [], [data])
  const total = data?.total ?? 0
  const studentName = studentId ? rows.find((l) => l.student_id === studentId)?.student_name : ''
  const filtered = Boolean(params.q || params.status || studentId)

  return (
    <AdminShell
      title="Leçons"
      actions={
        <button type="button" className={cx(ui.btn, ui.small, admin.tap, admin.blueGhost)} onClick={reload} disabled={loading}>
          <Icon icon={RefreshCw} size={16} /> Actualiser
        </button>
      }
    >
      <div className={admin.stack}>
        <div className={admin.toolbar}>
          <div className={admin.search}>
            <SearchInput
              value={params.q}
              onChange={(q) => setParams({ q, page: '1' })}
              placeholder="Rechercher un titre, un élève (nom ou e-mail)…"
              label="Rechercher une leçon"
            />
          </div>
          <FilterChips
            label="Filtrer par statut"
            options={LESSON_STATUS_FILTERS}
            value={params.status}
            onChange={(status) => setParams({ status, page: '1' })}
          />
          {studentId && (
            <span className={admin.chips}>
              <button
                type="button"
                className={cx(admin.chip, admin.chipActive)}
                onClick={() => setParams({ studentId: '', page: '1' })}
                aria-label={`Retirer le filtre élève${studentName ? ` (${studentName})` : ''}`}
              >
                Élève : {studentName || 'sélectionné'} <Icon icon={X} size={14} />
              </button>
            </span>
          )}
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
          rows={rows}
          loading={loading}
          caption="Liste des leçons"
          empty={filtered ? 'Aucune leçon ne correspond à ces filtres.' : 'Aucune leçon pour le moment.'}
          rowHref={(row) => `/admin/lessons/${row.id}`}
        />

        <Pagination page={page} perPage={PER_PAGE} total={total} onPage={(p) => setParams({ page: String(p) })} disabled={loading} />
      </div>
      <ToastViewport />
    </AdminShell>
  )
}
