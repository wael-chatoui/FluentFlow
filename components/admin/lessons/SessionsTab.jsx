import DataTable from '@/components/admin/common/DataTable'
import { formatDateTime, formatRelative, formatScore } from '@/components/admin/common/format'
import admin from '@/components/admin/common/admin.module.css'

const COLUMNS = [
  {
    key: 'completed_at',
    label: 'Terminée',
    render: (row) => (
      <span className={admin.nowrap} title={formatDateTime(row.completed_at)}>
        {formatRelative(row.completed_at)}
      </span>
    ),
  },
  {
    key: 'score',
    label: 'Score',
    align: 'right',
    render: (row) => <span className={admin.num}>{formatScore(row.score, row.total)}</span>,
  },
  { key: 'id', label: 'Identifiant', render: (row) => <span className={admin.mono}>{row.id}</span> },
]

/** "Sessions" tab: practice sessions of this lesson (read-only). */
export default function SessionsTab({ sessions }) {
  return (
    <DataTable
      columns={COLUMNS}
      rows={sessions || []}
      loading={false}
      empty="L'élève n'a pas encore fait d'entraînement sur cette leçon."
    />
  )
}
