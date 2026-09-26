import ui from '@/components/ui/ui.module.css'
import s from '@/components/admin/common/admin.module.css'
import { cx, formatNumber } from '@/components/admin/common/format'

/**
 * "1–50 sur 234" + previous / next buttons. `page` is 1-based.
 * @param {{ page: number, perPage: number, total: number, onPage: (page: number) => void, disabled?: boolean }} props
 */
export default function Pagination({ page, perPage, total, onPage, disabled = false }) {
  const safeTotal = Math.max(0, Number(total) || 0)
  const size = Math.max(1, Number(perPage) || 50)
  const pages = Math.max(1, Math.ceil(safeTotal / size))
  const current = Math.min(Math.max(1, Number(page) || 1), pages)
  const from = safeTotal === 0 ? 0 : (current - 1) * size + 1
  const to = Math.min(safeTotal, current * size)

  return (
    <nav className={s.pager} aria-label="Pagination">
      <span className={s.pagerInfo} aria-live="polite">
        {safeTotal === 0
          ? 'Aucun résultat'
          : `${formatNumber(from)}–${formatNumber(to)} sur ${formatNumber(safeTotal)}`}
      </span>
      {pages > 1 && (
        <div className={s.pagerNav}>
          <button
            type="button"
            className={cx(ui.btn, ui.small, s.tap)}
            onClick={() => onPage(current - 1)}
            disabled={disabled || current <= 1}
            aria-label="Page précédente"
          >
            ‹ <span className="sr-only">Précédente</span>
          </button>
          <span className={s.pagerPage}>
            Page {current} / {pages}
          </span>
          <button
            type="button"
            className={cx(ui.btn, ui.small, s.tap)}
            onClick={() => onPage(current + 1)}
            disabled={disabled || current >= pages}
            aria-label="Page suivante"
          >
            <span className="sr-only">Suivante</span> ›
          </button>
        </div>
      )}
    </nav>
  )
}
