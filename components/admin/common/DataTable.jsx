import { useRouter } from 'next/router'
import Link from 'next/link'
import ui from '@/components/ui/ui.module.css'
import s from '@/components/admin/common/admin.module.css'
import { cx } from '@/components/admin/common/format'

const INTERACTIVE = 'a, button, input, select, textarea, label, summary, [role="button"]'
const SKELETON_ROWS = 6
const SKEL_WIDTHS = ['70%', '55%', '85%', '40%', '65%', '50%']

function cellValue(column, row) {
  if (column.render) return column.render(row)
  const v = row?.[column.key]
  if (v === null || v === undefined || v === '') return <span className={s.muted}>—</span>
  if (typeof v === 'boolean') return v ? 'Oui' : 'Non'
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}

function alignClass(align) {
  if (align === 'right') return s.alignRight
  if (align === 'center') return s.alignCenter
  return undefined
}

/**
 * Responsive data table: a real <table> with a sticky header from 768px,
 * stacked cards below. Skeleton rows while loading with no rows yet.
 *
 * Clickable rows: with `rowHref`, the primary cell is a real link (keyboard and
 * screen readers) and the rest of the row / card is a mouse shortcut to it.
 * `onRowClick` is a mouse shortcut only: the row must then contain its own link or
 * button for keyboard users (e.g. the explorer's id cell links).
 *
 * @param {{
 *   columns: Array<{ key: string, label: string, render?: (row: any) => React.ReactNode,
 *     width?: string|number, align?: 'left'|'right'|'center',
 *     sortable?: boolean,      // default true when onSort is given
 *     primary?: boolean,       // card title on mobile (default: first column)
 *     mobileHidden?: boolean,  // hide in the mobile card
 *   }>,
 *   rows: any[],
 *   loading?: boolean,
 *   empty?: React.ReactNode,
 *   onRowClick?: (row: any) => void,
 *   rowHref?: (row: any) => string|null,
 *   sort?: { key: string, dir: 'asc'|'desc' },
 *   onSort?: (key: string) => void,
 *   rowKey?: (row: any, index: number) => string,
 *   caption?: string,          // sr-only table caption
 *   maxHeight?: string,        // scroll area max height on desktop (default 72vh)
 * }} props
 */
export default function DataTable({
  columns,
  rows,
  loading = false,
  empty,
  onRowClick,
  rowHref,
  sort,
  onSort,
  rowKey,
  caption,
  maxHeight,
}) {
  const router = useRouter()
  const list = Array.isArray(rows) ? rows : []
  const showSkeleton = loading && list.length === 0
  const keyOf = (row, i) => (rowKey ? rowKey(row, i) : row?.id ?? i)
  const hrefOf = (row) => (!onRowClick && rowHref ? rowHref(row) || null : null)

  const activate = (row, e) => {
    if (onRowClick) {
      onRowClick(row)
      return
    }
    const href = hrefOf(row)
    if (!href) return
    if (e && (e.metaKey || e.ctrlKey)) window.open(href, '_blank', 'noopener')
    else router.push(href)
  }

  const handleRowClick = (row) => (e) => {
    // Let links/buttons inside cells do their own thing
    const hit = e.target instanceof Element ? e.target.closest(INTERACTIVE) : null
    if (hit && hit !== e.currentTarget && e.currentTarget.contains(hit)) return
    if (window.getSelection?.().toString()) return
    activate(row, e)
  }

  if (!loading && list.length === 0) {
    return (
      <div className={cx(s.empty, s.dtEmpty)} role="status">
        {empty || 'Aucun résultat.'}
      </div>
    )
  }

  const primaryCol = columns.find((c) => c.primary) || columns[0]
  const cardCols = columns.filter((c) => c !== primaryCol && !c.mobileHidden)

  return (
    <div className={cx(s.dt, loading && list.length > 0 && s.dtBusy)} aria-busy={loading || undefined}>
      {/* ---- Desktop / tablet: table ---- */}
      <div className={s.dtTableWrap}>
        <div className={s.dtScroll} style={maxHeight ? { '--dt-max-h': maxHeight } : undefined}>
          <table className={s.dtTable}>
            {caption && <caption className="sr-only">{caption}</caption>}
            <thead>
              <tr>
                {columns.map((col) => {
                  const sortable = Boolean(onSort) && col.sortable !== false
                  const active = sort?.key === col.key
                  const ariaSort = active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined
                  return (
                    <th
                      key={col.key}
                      scope="col"
                      className={alignClass(col.align)}
                      style={col.width ? { width: col.width } : undefined}
                      aria-sort={sortable ? ariaSort || 'none' : undefined}
                    >
                      {sortable ? (
                        <button
                          type="button"
                          className={cx(s.sortBtn, active && s.sortActive)}
                          onClick={() => onSort(col.key)}
                        >
                          {col.label}
                          <span className={s.sortArrow} aria-hidden="true">
                            {active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}
                          </span>
                        </button>
                      ) : (
                        col.label
                      )}
                    </th>
                  )
                })}
              </tr>
            </thead>
            <tbody>
              {showSkeleton
                ? Array.from({ length: SKELETON_ROWS }, (_, i) => (
                    <tr key={`skel-${i}`} aria-hidden="true">
                      {columns.map((col, j) => (
                        <td key={col.key}>
                          <span
                            className={ui.skel}
                            style={{ height: 14, width: SKEL_WIDTHS[(i + j) % SKEL_WIDTHS.length] }}
                          />
                        </td>
                      ))}
                    </tr>
                  ))
                : list.map((row, i) => {
                    const href = hrefOf(row)
                    const rowClickable = Boolean(onRowClick || href)
                    return (
                      <tr
                        key={keyOf(row, i)}
                        className={rowClickable ? s.dtRowClickable : undefined}
                        onClick={rowClickable ? handleRowClick(row) : undefined}
                      >
                        {columns.map((col) => (
                          <td key={col.key} className={alignClass(col.align)}>
                            {href && col === primaryCol ? (
                              <Link href={href} className={s.rowLink}>
                                {cellValue(col, row)}
                              </Link>
                            ) : (
                              cellValue(col, row)
                            )}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ---- Mobile: stacked cards ---- */}
      <ul className={s.dtCards}>
        {showSkeleton
          ? Array.from({ length: 4 }, (_, i) => (
              <li key={`skel-${i}`} className={s.dtCard} aria-hidden="true">
                <span className={ui.skel} style={{ height: 16, width: '60%', marginBottom: 12 }} />
                <span className={ui.skel} style={{ height: 12, width: '85%', marginBottom: 8 }} />
                <span className={ui.skel} style={{ height: 12, width: '45%' }} />
              </li>
            ))
          : list.map((row, i) => {
              const href = hrefOf(row)
              const title = cellValue(primaryCol, row)
              const body = (
                <>
                  <div className={s.dtCardTop}>
                    <div className={s.dtCardTitle}>
                      {href ? (
                        <Link href={href} className={s.dtCardLink}>
                          {title}
                        </Link>
                      ) : (
                        title
                      )}
                    </div>
                    {(href || onRowClick) && <span className={s.dtChevron} aria-hidden="true">›</span>}
                  </div>
                  {cardCols.length > 0 && (
                    <dl className={s.dtCardFields}>
                      {cardCols.map((col) => (
                        <div key={col.key} style={{ display: 'contents' }}>
                          <dt>{col.label}</dt>
                          <dd>{cellValue(col, row)}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                </>
              )
              return (
                <li key={keyOf(row, i)}>
                  {href ? (
                    <div className={cx(s.dtCard, s.dtCardClickable, s.dtCardLinked)}>{body}</div>
                  ) : onRowClick ? (
                    <div className={cx(s.dtCard, s.dtCardClickable)} onClick={handleRowClick(row)}>
                      {body}
                    </div>
                  ) : (
                    <div className={s.dtCard}>{body}</div>
                  )}
                </li>
              )
            })}
      </ul>
    </div>
  )
}
