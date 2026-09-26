import s from '@/components/admin/common/admin.module.css'
import { cx } from '@/components/admin/common/format'

const TONES = {
  green: s.pillGreen,
  blue: s.pillBlue,
  red: s.pillRed,
  purple: s.pillPurple,
  orange: s.pillOrange,
  yellow: s.pillYellow,
  gray: s.pillGray,
}

export const LESSON_STATUS = {
  published: { label: 'Publiée', tone: 'green' },
  generating: { label: 'En génération', tone: 'blue', pulse: true },
  failed: { label: 'Échec', tone: 'red' },
}

export const ROLE_META = {
  student: { label: 'Élève', tone: 'blue', icon: '🎓' },
  teacher: { label: 'Prof', tone: 'orange', icon: '🧑‍🏫' },
  admin: { label: 'Admin', tone: 'purple', icon: '🛠️' },
  banned: { label: 'Banni', tone: 'red', icon: '⛔' },
}

/**
 * Colored pill.
 * - Lesson status: `<StatusPill status="published|generating|failed" />`
 * - Role: `<StatusPill role="student|teacher|admin|banned" />`
 * - Custom: `<StatusPill tone="green|blue|red|purple|orange|yellow|gray">Texte</StatusPill>`
 * @param {{ status?: string, role?: string, tone?: string, dot?: boolean, children?: React.ReactNode, title?: string }} props
 */
export default function StatusPill({ status, role, tone, dot, children, title }) {
  let meta
  if (status !== undefined) {
    meta = LESSON_STATUS[status] || { label: status || 'Inconnu', tone: 'gray' }
    meta = { ...meta, dot: dot ?? true }
  } else if (role !== undefined) {
    meta = ROLE_META[role] || { label: role || 'Inconnu', tone: 'gray' }
  } else {
    meta = { label: null, tone: tone || 'gray', dot }
  }
  const finalTone = tone || meta.tone
  return (
    <span className={cx(s.pill, TONES[finalTone] || s.pillGray, meta.pulse && s.pillPulse)} title={title}>
      {meta.dot && <span className={s.pillDot} aria-hidden="true" />}
      {meta.icon && <span aria-hidden="true">{meta.icon}</span>}
      {children ?? meta.label}
    </span>
  )
}

/**
 * Role pill + Admin + Banni pills for a user row `{ role, is_admin, banned }`.
 * @param {{ user: { role?: string, is_admin?: boolean, banned?: boolean } }} props
 */
export function UserRolePills({ user }) {
  if (!user) return null
  return (
    <span className={s.pills}>
      <StatusPill role={user.role === 'teacher' ? 'teacher' : 'student'} />
      {user.is_admin && <StatusPill role="admin" />}
      {user.banned && <StatusPill role="banned" />}
    </span>
  )
}
