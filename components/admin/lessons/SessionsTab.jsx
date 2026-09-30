import DataTable from '@/components/admin/common/DataTable'
import StatusPill from '@/components/admin/common/StatusPill'
import { formatDateTime, formatNumber, formatRelative, formatScore } from '@/components/admin/common/format'
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
  {
    key: 'current',
    label: 'Version',
    render: (row) =>
      row.current ? (
        <StatusPill tone="green">Actuelle</StatusPill>
      ) : (
        <StatusPill tone="gray" title="Faite avant la dernière génération ou modification des exercices : ne compte plus">
          Ancienne
        </StatusPill>
      ),
  },
  { key: 'id', label: 'Identifiant', render: (row) => <span className={admin.mono}>{row.id}</span> },
]

/**
 * "Sessions" tab: practice sessions of this lesson (read-only). Only the sessions of
 * the current version (at/after generated_at) count in the student's progress.
 */
export default function SessionsTab({ sessions, reviewCount }) {
  const list = sessions || []
  const current = list.filter((s) => s.current).length
  return (
    <div className={admin.stack}>
      {list.length > 0 && (
        <p className={admin.sectionSub}>
          {formatNumber(current)} session{current > 1 ? 's' : ''} sur la version actuelle ·{' '}
          {formatNumber(reviewCount || 0)} réponse{reviewCount > 1 ? 's' : ''} en révision
        </p>
      )}
      <DataTable
        columns={COLUMNS}
        rows={list}
        loading={false}
        caption="Sessions d’entraînement de la leçon"
        empty="L'élève n'a pas encore fait d'entraînement sur cette leçon."
      />
    </div>
  )
}
