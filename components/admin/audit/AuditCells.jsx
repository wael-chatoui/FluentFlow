import Link from 'next/link'
import StatusPill from '@/components/admin/common/StatusPill'
import { cx } from '@/components/admin/common/format'
import admin from '@/components/admin/common/admin.module.css'
import styles from '@/components/admin/audit/audit.module.css'

export const ENTITY_LABELS = { user: 'Utilisateur', lesson: 'Leçon' }

// Actions/entities known from the API contract; values seen in the log are added at runtime
export const KNOWN_ACTIONS = [
  'user.invite',
  'user.approve',
  'user.sign_in_link',
  'user.update',
  'user.delete',
  'lesson.update',
  'lesson.delete',
]
export const KNOWN_ENTITIES = ['user', 'lesson']

function actionTone(action) {
  const verb = String(action || '').split('.').pop()
  if (verb === 'delete') return 'red'
  if (verb === 'create' || verb === 'invite' || verb === 'approve') return 'green'
  if (verb === 'update') return 'blue'
  if (verb === 'sign_in_link') return 'orange' // gives access to the account: worth spotting
  return 'gray'
}

export function ActionPill({ action }) {
  return (
    <StatusPill tone={actionTone(action)}>
      <span className={admin.mono}>{action || '—'}</span>
    </StatusPill>
  )
}

function entityHref(entry) {
  if (!entry.entity_id || String(entry.action).endsWith('.delete')) return null
  if (entry.entity === 'user') return `/admin/users/${entry.entity_id}`
  if (entry.entity === 'lesson') return `/admin/lessons/${entry.entity_id}`
  return null
}

export function EntityCell({ entry }) {
  const href = entityHref(entry)
  const id = entry.entity_id ? String(entry.entity_id) : ''
  const short = id.length > 12 ? `${id.slice(0, 8)}…` : id
  return (
    <span className={styles.entity}>
      <span className={styles.entityName}>{ENTITY_LABELS[entry.entity] || entry.entity || '—'}</span>
      {id &&
        (href ? (
          <Link href={href} className={cx(admin.link, admin.mono)} title={id}>
            {short}
          </Link>
        ) : (
          <span className={cx(admin.mono, admin.muted)} title={id}>
            {short}
          </span>
        ))}
    </span>
  )
}

/** Collapsed pretty JSON of `details`. */
export function DetailsCell({ details }) {
  if (details === null || details === undefined || (typeof details === 'object' && Object.keys(details).length === 0)) {
    return <span className={admin.muted}>—</span>
  }
  const keys = typeof details === 'object' && !Array.isArray(details) ? Object.keys(details) : []
  const summary = keys.length ? keys.slice(0, 3).join(', ') + (keys.length > 3 ? '…' : '') : 'détails'
  return (
    <details className={styles.details}>
      <summary className={styles.summary}>
        <span className={admin.mono}>{summary}</span>
      </summary>
      <pre className={styles.json}>{JSON.stringify(details, null, 2)}</pre>
    </details>
  )
}
