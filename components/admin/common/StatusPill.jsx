import s from '@/components/admin/common/admin.module.css'
import { cx } from '@/components/admin/common/format'
import { Ban, FilePen, GraduationCap, Hourglass, Mail, Presentation, ShieldCheck } from 'lucide-react'
import Icon from '@/components/ui/Icon'

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
  student: { label: 'Élève', tone: 'blue', icon: GraduationCap },
  teacher: { label: 'Prof', tone: 'orange', icon: Presentation },
  admin: { label: 'Admin', tone: 'purple', icon: ShieldCheck },
  banned: { label: 'Banni', tone: 'red', icon: Ban },
  pending: { label: 'En attente d’approbation', tone: 'yellow', icon: Hourglass },
  invited: { label: 'Invitation en attente', tone: 'gray', icon: Mail },
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
      {meta.icon && <Icon icon={meta.icon} size={13} />}
      {children ?? meta.label}
    </span>
  )
}

/**
 * Role pill + Admin / Banni / access-state pills for a user row
 * `{ role, is_admin, banned, approved, invite_pending }`.
 * @param {{ user: { role?: string, is_admin?: boolean, banned?: boolean, approved?: boolean, invite_pending?: boolean } }} props
 */
export function UserRolePills({ user }) {
  if (!user) return null
  return (
    <span className={s.pills}>
      <StatusPill role={user.role === 'teacher' ? 'teacher' : 'student'} />
      {user.is_admin && <StatusPill role="admin" />}
      {user.banned && <StatusPill role="banned" />}
      {user.approved === false && <StatusPill role="pending" />}
      {user.invite_pending && <StatusPill role="invited" />}
    </span>
  )
}

/**
 * State pills of a lesson `{ status, hidden, stale? }`, in the teacher area's words
 * (components/teacher/StatusBadge.jsx): a published lesson hidden from its student is
 * a « Brouillon » (in place of « Publiée »), a stuck generation is « Bloquée » (in place
 * of « En génération »). A hidden lesson in another status also gets « Brouillon ».
 * @param {{ lesson: { status: string, hidden?: boolean, stale?: boolean } }} props
 */
export function LessonStatusPills({ lesson }) {
  const { status, hidden, stale } = lesson || {}
  const draft = (
    <StatusPill tone="orange" title="L’élève ne voit pas cette leçon (à relire avant de la publier, ou retirée de son espace)">
      <Icon icon={FilePen} size={13} /> Brouillon
    </StatusPill>
  )
  let main = <StatusPill status={status} />
  if (status === 'published' && hidden) main = null
  else if (status === 'generating' && stale) {
    main = (
      <StatusPill tone="yellow" dot title="Génération bloquée depuis plus de 5 minutes">
        Bloquée
      </StatusPill>
    )
  }
  return (
    <span className={s.pills}>
      {main}
      {hidden && draft}
    </span>
  )
}
