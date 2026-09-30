import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import AdminShell from '@/components/admin/AdminShell'
import DataTable from '@/components/admin/common/DataTable'
import Pagination from '@/components/admin/common/Pagination'
import SearchInput from '@/components/admin/common/SearchInput'
import { useToast, ToastViewport } from '@/components/admin/common/Toast'
import useAdminQuery from '@/components/admin/common/useAdminQuery'
import { cx, formatNumber } from '@/components/admin/common/format'
import useUrlQuery, { toPage, toQueryString } from '@/components/admin/tables/useUrlQuery'
import ValueCell from '@/components/admin/tables/ValueCell'
import ValueDialog from '@/components/admin/tables/ValueDialog'
import { TABLE_ICONS, downloadText, rowLink, toCsv } from '@/components/admin/tables/tableMeta'
import admin from '@/components/admin/common/admin.module.css'
import ui from '@/components/ui/ui.module.css'

const PER_PAGE = 50
const DEFAULTS = { q: '', sort: '', dir: 'desc', page: '1' }
const SAFE_NAME = /^[a-z_][a-z0-9_]*$/i

export default function AdminTableExplorerPage() {
  const router = useRouter()
  const toast = useToast()
  const table = router.isReady && typeof router.query.table === 'string' ? router.query.table : ''
  const validTable = SAFE_NAME.test(table)
  const { ready, params, setParams } = useUrlQuery(DEFAULTS, ['table'])
  const page = toPage(params.page)
  const dir = params.dir === 'asc' ? 'asc' : 'desc'

  const url =
    ready && validTable
      ? `/api/admin/tables/${encodeURIComponent(table)}${toQueryString({
          q: params.q.trim(),
          sort: params.sort,
          dir: params.sort ? dir : '',
          page,
          perPage: PER_PAGE,
        })}`
      : null
  const { data, error, loading, reload } = useAdminQuery(url)
  const current = data && data.table === table ? data : null

  // The server clamps a page past the end (bookmarked URL, deleted rows): follow it
  useEffect(() => {
    if (current?.page && current.page !== page && !loading && !error) setParams({ page: String(current.page) })
  }, [current, page, loading, error, setParams])

  const [viewing, setViewing] = useState(null) // { column, value }
  const closeView = useCallback(() => setViewing(null), [])
  const onView = useCallback((column, value) => setViewing({ column, value }), [])

  const columns = useMemo(
    () =>
      (current?.columns || []).map((col) => ({
        key: col.name,
        label: col.name,
        align: col.type === 'number' ? 'right' : undefined,
        render: (row) => <ValueCell table={table} column={col} value={row[col.name]} onView={onView} />,
      })),
    [current, table, onView]
  )
  const rows = current?.rows || []
  const hasLinks = rows.some((r) => rowLink(table, r))

  // onRowClick (not rowHref): cells may contain links, and links can't be nested. The
  // row click is a mouse shortcut; keyboard users reach the same page through the id cell link.
  const openRow = (row) => {
    const href = rowLink(table, row)
    if (href) router.push(href)
  }

  const onSort = (key) => {
    if (params.sort === key) setParams({ dir: dir === 'asc' ? 'desc' : 'asc', page: '1' })
    else setParams({ sort: key, dir: 'asc', page: '1' })
  }

  const exportCsv = () => {
    if (!current || rows.length === 0) return
    const names = current.columns.map((c) => c.name)
    const date = new Date().toISOString().slice(0, 10)
    downloadText(`${table}-page${page}-${date}.csv`, toCsv(names, rows))
    toast.success(`${formatNumber(rows.length)} ligne${rows.length > 1 ? 's' : ''} exportée${rows.length > 1 ? 's' : ''}.`)
  }

  const copy = useCallback(
    async (text) => {
      try {
        await navigator.clipboard.writeText(text)
        toast.success('Valeur copiée.')
      } catch {
        toast.error('Impossible de copier (autorisation refusée par le navigateur).')
      }
    },
    [toast]
  )

  const title = current?.label || table || 'Table'

  return (
    <AdminShell
      title={`${TABLE_ICONS[table] || '🗂️'} ${title}`}
      actions={
        <>
          <Link href="/admin/tables" className={cx(ui.btn, ui.small, admin.tap)}>
            <span aria-hidden="true">←</span> Tables
          </Link>
          <button
            type="button"
            className={cx(ui.btn, ui.small, admin.tap, admin.blueGhost)}
            onClick={exportCsv}
            disabled={!current || rows.length === 0}
          >
            <span aria-hidden="true">⬇️</span> Exporter CSV
          </button>
        </>
      }
    >
      {router.isReady && !validTable ? (
        <div className={cx(admin.section, admin.errorState)}>
          <span className={admin.stateIcon} aria-hidden="true">🤔</span>
          <p>Nom de table invalide.</p>
        </div>
      ) : (
        <div className={admin.stack}>
          <div className={admin.toolbar}>
            <div className={admin.search}>
              <SearchInput
                value={params.q}
                onChange={(q) => setParams({ q, page: '1' })}
                placeholder="Rechercher dans les colonnes texte…"
                label="Rechercher dans la table"
              />
            </div>
            <span className={admin.sectionSub}>
              <span className={admin.mono}>{table}</span>
              {current && ` · ${formatNumber(current.total)} ligne${current.total > 1 ? 's' : ''}`}
              {hasLinks && ' · clique une ligne pour l’ouvrir'}
            </span>
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
            columns={columns}
            rows={rows}
            loading={loading}
            empty={params.q ? 'Aucune ligne ne correspond à cette recherche.' : 'Cette table est vide.'}
            onRowClick={hasLinks ? openRow : undefined}
            caption={`Lignes de la table ${table}`}
            sort={params.sort ? { key: params.sort, dir } : undefined}
            onSort={onSort}
          />

          <Pagination
            page={page}
            perPage={PER_PAGE}
            total={current?.total ?? 0}
            onPage={(p) => setParams({ page: String(p) })}
            disabled={loading}
          />
        </div>
      )}

      <ValueDialog
        open={Boolean(viewing)}
        title={viewing?.column || ''}
        value={viewing?.value}
        onClose={closeView}
        onCopy={copy}
      />
      <ToastViewport />
    </AdminShell>
  )
}
