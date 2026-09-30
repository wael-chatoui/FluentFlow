import Link from 'next/link'
import { cx, formatDateTime, formatNumber } from '@/components/admin/common/format'
import { cellLink } from '@/components/admin/tables/tableMeta'
import admin from '@/components/admin/common/admin.module.css'
import styles from '@/components/admin/tables/tables.module.css'
import { Check } from 'lucide-react'
import Icon from '@/components/ui/Icon'

const LONG = 60

// Clicks inside a cell must not trigger the row link / row click
const isolate = (e) => e.stopPropagation()

/**
 * One explorer cell, rendered by column type. Long text / JSON show a monospace
 * preview + "voir" button that opens the full value.
 */
export default function ValueCell({ table, column, value, onView }) {
  if (value === null || value === undefined) {
    return (
      <span className={styles.null} title="null">
        ∅
      </span>
    )
  }

  const { name, type } = column

  if (type === 'boolean') {
    return value ? (
      <span className={cx(admin.pill, admin.pillGreen)}>
        <Icon icon={Check} size={13} strokeWidth={3} /> oui
      </span>
    ) : <span className={cx(admin.pill, admin.pillGray)}>non</span>
  }

  if (type === 'number') return <span className={admin.num}>{formatNumber(value)}</span>

  if (type === 'date') {
    return (
      <time className={admin.nowrap} dateTime={String(value)} title={String(value)}>
        {formatDateTime(value)}
      </time>
    )
  }

  if (type === 'uuid') {
    const href = cellLink(table, name, value)
    const short = `${String(value).slice(0, 8)}…`
    return href ? (
      <Link href={href} className={cx(admin.link, admin.mono)} title={String(value)} onClick={isolate}>
        {short}
      </Link>
    ) : (
      <span className={admin.mono} title={String(value)}>
        {short}
      </span>
    )
  }

  // json columns arrive already stringified (and possibly truncated) from the API
  const text = typeof value === 'object' ? JSON.stringify(value) : String(value)
  const long = type === 'json' || text.length > LONG || text.includes('\n')
  if (!long) {
    const href = cellLink(table, name, value)
    return href ? (
      <Link href={href} className={admin.link} onClick={isolate}>
        {text}
      </Link>
    ) : (
      <span className={styles.text}>{text}</span>
    )
  }

  return (
    <span className={styles.longCell}>
      <span className={cx(admin.mono, styles.preview)}>{text.slice(0, LONG)}</span>
      <button
        type="button"
        className={styles.viewBtn}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onView(name, value)
        }}
        aria-label={`Voir la valeur complète de ${name}`}
      >
        voir
      </button>
    </span>
  )
}
