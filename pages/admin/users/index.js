import { useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import AdminShell from '@/components/admin/AdminShell'
import CopyLink from '@/components/admin/common/CopyLink'
import DataTable from '@/components/admin/common/DataTable'
import Pagination from '@/components/admin/common/Pagination'
import SearchInput from '@/components/admin/common/SearchInput'
import FilterChips from '@/components/admin/common/FilterChips'
import Modal from '@/components/admin/common/Modal'
import StatusPill, { UserRolePills } from '@/components/admin/common/StatusPill'
import { ToastViewport, useToast } from '@/components/admin/common/Toast'
import useAdminQuery from '@/components/admin/common/useAdminQuery'
import {
  cx,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelative,
  initialsOf,
  isAbortError,
} from '@/components/admin/common/format'
import useUrlQuery, { toPage, toQueryString } from '@/components/admin/tables/useUrlQuery'
import { api } from '@/utils/apiClient'
import ui from '@/components/ui/ui.module.css'
import s from '@/components/admin/common/admin.module.css'
import u from '@/components/admin/common/users.module.css'
import { CircleAlert, CircleCheck, Search, UserPlus } from 'lucide-react'
import Icon from '@/components/ui/Icon'

const PER_PAGE = 50
const DEFAULTS = { q: '', role: 'all', sort: '', dir: '', page: '1' }
const ROLE_OPTIONS = [
  { value: 'all', label: 'Tous' },
  { value: 'student', label: 'Élèves' },
  { value: 'teacher', label: 'Profs' },
  { value: 'admin', label: 'Admins' },
  { value: 'pending', label: 'En attente' },
]
const ROLES = ROLE_OPTIONS.map((o) => o.value)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Dates and counts: the first click sorts newest / biggest first
const DESC_FIRST = new Set(['onboarded_at', 'lesson_count', 'session_count', 'created_at', 'last_sign_in_at'])

const COLUMNS = [
  {
    key: 'full_name',
    label: 'Nom',
    primary: true,
    render: (r) => (
      <span className={u.nameCell}>
        <span className={u.miniAvatar} aria-hidden="true">
          {initialsOf(r.full_name || r.email)}
        </span>
        <span className={s.cellStrong}>{r.full_name?.trim() || <span className={s.muted}>Sans nom</span>}</span>
      </span>
    ),
  },
  { key: 'email', label: 'E-mail', render: (r) => <span style={{ overflowWrap: 'anywhere' }}>{r.email || '—'}</span> },
  { key: 'role', label: 'Rôle', render: (r) => <UserRolePills user={r} /> },
  {
    key: 'level',
    label: 'Niveau',
    align: 'center',
    render: (r) =>
      r.level && r.level !== 'unknown' ? <StatusPill tone="blue">{r.level}</StatusPill> : <span className={s.muted}>—</span>,
  },
  {
    key: 'onboarded_at',
    label: 'Onboardé',
    align: 'center',
    render: (r) =>
      r.onboarded_at ? (
        <span title={formatDateTime(r.onboarded_at)}>
          <Icon icon={CircleCheck} size={18} className={s.okIcon} />
          <span className="sr-only">Oui, le {formatDate(r.onboarded_at)}</span>
        </span>
      ) : r.role === 'teacher' ? (
        <span className={s.muted}>—</span>
      ) : (
        <StatusPill tone="yellow">Non</StatusPill>
      ),
  },
  { key: 'lesson_count', label: 'Leçons', align: 'right', render: (r) => <span className={s.num}>{formatNumber(r.lesson_count || 0)}</span> },
  { key: 'session_count', label: 'Sessions', align: 'right', render: (r) => <span className={s.num}>{formatNumber(r.session_count || 0)}</span> },
  {
    key: 'created_at',
    label: 'Inscrit le',
    render: (r) => (
      <span className={s.nowrap} title={formatDateTime(r.created_at)}>
        {formatDate(r.created_at)}
      </span>
    ),
  },
  {
    key: 'last_sign_in_at',
    label: 'Dernière connexion',
    render: (r) =>
      r.last_sign_in_at ? (
        <span className={s.nowrap} title={formatDateTime(r.last_sign_in_at)}>
          {formatRelative(r.last_sign_in_at)}
        </span>
      ) : (
        <span className={s.muted}>Jamais</span>
      ),
  },
]

const EMPTY_INVITE = { email: '', fullName: '', role: 'student', isAdmin: false, sendEmail: false }

function InviteModal({ open, onClose, onInvited }) {
  const toast = useToast()
  const uid = useId()
  const emailRef = useRef(null)
  const doneRef = useRef(null)
  const controllerRef = useRef(null)
  const mounted = useRef(true)
  const [values, setValues] = useState(EMPTY_INVITE)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [created, setCreated] = useState(null) // { user, link } once the account exists

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controllerRef.current?.abort()
    }
  }, [])

  // Reset on close (not on open): reopening must never show the previous link, even for a frame
  useEffect(() => {
    if (!open) {
      setValues(EMPTY_INVITE)
      setTouched(false)
      setError(null)
      setCreated(null)
    }
  }, [open])

  // The link view replaces the form: move the focus to it
  useEffect(() => {
    if (created) requestAnimationFrame(() => doneRef.current?.focus())
  }, [created])

  const email = values.email.trim()
  const emailError = !email ? 'L’e-mail est obligatoire.' : EMAIL_RE.test(email) ? null : 'Adresse e-mail invalide.'
  const showEmailError = touched && Boolean(emailError)
  const formId = `${uid}-form`
  const id = (name) => `${uid}-${name}`

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setValues((v) => ({ ...v, [key]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (busy) return
    setTouched(true)
    if (emailError) {
      emailRef.current?.focus()
      return
    }
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setBusy(true)
    setError(null)
    try {
      const res = await api('/api/admin/users', {
        method: 'POST',
        body: {
          email,
          fullName: values.fullName.trim() || undefined,
          role: values.role,
          isAdmin: values.isAdmin,
          sendEmail: values.sendEmail,
        },
        signal: controller.signal,
      })
      if (!mounted.current) return
      onInvited?.()
      if (res.link) {
        setCreated({ user: res.user, link: res.link })
      } else {
        toast.success(`Invitation envoyée par e-mail à ${email}`)
        onClose()
      }
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      setError(err.message || "L'invitation a échoué.")
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  if (created) {
    return (
      <Modal
        open={open}
        title="Compte créé"
        icon={CircleCheck}
        onClose={onClose}
        initialFocusRef={doneRef}
        actions={
          <>
            <Link href={`/admin/users/${created.user.id}`} className={cx(ui.btn, s.tap)} onClick={onClose}>
              Voir la fiche
            </Link>
            <button ref={doneRef} type="button" className={cx(ui.btn, ui.green, s.tap)} onClick={onClose}>
              Terminé
            </button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          Envoie ce lien à <strong>{created.user.email}</strong> (par exemple dans le chat Preply) : il ouvre son compte
          sans mot de passe.
        </p>
        <CopyLink
          link={created.link}
          label="Lien d’invitation"
          hint="Lien personnel à usage unique. S’il expire, génère-en un nouveau depuis sa fiche (« Copier un lien de connexion »)."
        />
      </Modal>
    )
  }

  return (
    <Modal
      open={open}
      title="Inviter un utilisateur"
      icon={UserPlus}
      onClose={onClose}
      busy={busy}
      initialFocusRef={emailRef}
      actions={
        <>
          <button type="button" className={cx(ui.btn, s.tap)} onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button type="submit" form={formId} className={cx(ui.btn, ui.green, s.tap)} disabled={busy} aria-busy={busy || undefined}>
            {busy && <span className={s.spinner} aria-hidden="true" />}
            {busy ? 'Création…' : values.sendEmail ? "Envoyer l'invitation" : 'Créer le compte'}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>
        L’accès se fait sur invitation, sans mot de passe : la personne se connecte avec Google ou un lien reçu par
        e-mail.
      </p>
      <form id={formId} className={u.inviteForm} onSubmit={handleSubmit} noValidate>
        <fieldset className={u.fieldset} disabled={busy}>
          <legend className="sr-only">Nouvel utilisateur</legend>
          <div className={s.field}>
            <label htmlFor={id('email')} className={s.label}>
              E-mail
            </label>
            <input
              ref={emailRef}
              id={id('email')}
              type="email"
              inputMode="email"
              className={cx(s.input, showEmailError && s.invalid)}
              value={values.email}
              onChange={set('email')}
              onBlur={() => setTouched(true)}
              placeholder="prenom.nom@exemple.com"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              required
              aria-invalid={showEmailError || undefined}
              aria-describedby={showEmailError ? id('email-error') : undefined}
            />
            {showEmailError && (
              <p id={id('email-error')} className={s.fieldError} role="alert">
                {emailError}
              </p>
            )}
          </div>
          <div className={s.field}>
            <label htmlFor={id('name')} className={s.label}>
              Nom <span className={s.muted}>(facultatif)</span>
            </label>
            <input
              id={id('name')}
              className={s.input}
              value={values.fullName}
              onChange={set('fullName')}
              placeholder="Prénom Nom"
              autoComplete="off"
              maxLength={120}
            />
          </div>
          <div className={s.field}>
            <label htmlFor={id('role')} className={s.label}>
              Rôle
            </label>
            <select
              id={id('role')}
              className={cx(s.input, s.select)}
              value={values.role}
              onChange={set('role')}
              aria-describedby={id('role-hint')}
            >
              <option value="student">Élève</option>
              <option value="teacher">Prof</option>
            </select>
            <p id={id('role-hint')} className={s.hint}>
              {values.role === 'teacher'
                ? 'Un prof voit les leçons, les profils et les notes privées de tous les élèves.'
                : 'Un élève voit uniquement ses propres leçons.'}
            </p>
          </div>
          <label className={s.check}>
            <input type="checkbox" checked={values.isAdmin} onChange={set('isAdmin')} />
            <span>Accès au back office (admin)</span>
          </label>
          <div className={s.field}>
            <label className={s.check}>
              <input type="checkbox" checked={values.sendEmail} onChange={set('sendEmail')} aria-describedby={id('send-hint')} />
              <span>Envoyer l’invitation par e-mail</span>
            </label>
            <p id={id('send-hint')} className={s.hint}>
              {values.sendEmail
                ? 'Supabase envoie l’e-mail d’invitation (quelques envois par heure avec le serveur d’e-mails par défaut).'
                : 'Sinon, un lien à usage unique s’affiche : envoie-le toi-même (par exemple dans le chat Preply).'}
            </p>
          </div>
        </fieldset>
        {error && (
          <div className={s.alert} role="alert">
            <Icon icon={CircleAlert} size={20} />
            <span className={s.alertText}>{error}</span>
          </div>
        )}
      </form>
    </Modal>
  )
}

export default function AdminUsers() {
  const [inviteOpen, setInviteOpen] = useState(false)
  const { ready, params, setParams } = useUrlQuery(DEFAULTS)
  const q = params.q.trim()
  const role = ROLES.includes(params.role) ? params.role : 'all'
  const page = toPage(params.page)
  const sortKey = COLUMNS.some((c) => c.key === params.sort) ? params.sort : ''
  const dir = params.dir === 'asc' || params.dir === 'desc' ? params.dir : ''

  const url = ready
    ? `/api/admin/users${toQueryString({ q, role: role === 'all' ? '' : role, sort: sortKey, dir: sortKey ? dir : '', page, perPage: PER_PAGE })}`
    : null
  const { data, error, loading, reload } = useAdminQuery(url)

  // The server clamps a page past the end (e.g. after deletions): follow it
  useEffect(() => {
    if (data?.page && data.page !== page && !loading && !error) setParams({ page: String(data.page) })
  }, [data, page, loading, error, setParams])

  // Shown sort: the server default is « newest first »
  const sort = sortKey ? { key: sortKey, dir: dir || (DESC_FIRST.has(sortKey) ? 'desc' : 'asc') } : { key: 'created_at', dir: 'desc' }
  const handleSort = (key) => {
    const nextDir = sort.key === key ? (sort.dir === 'asc' ? 'desc' : 'asc') : DESC_FIRST.has(key) ? 'desc' : 'asc'
    setParams({ sort: key, dir: nextDir, page: '1' })
  }

  const rows = Array.isArray(data?.users) ? data.users : []
  const hasFilters = Boolean(q) || role !== 'all'

  return (
    <AdminShell
      title="Utilisateurs"
      actions={
        <button type="button" className={cx(ui.btn, ui.green, ui.small, s.tap)} onClick={() => setInviteOpen(true)}>
          <Icon icon={UserPlus} size={16} /> Inviter un utilisateur
        </button>
      }
    >
      <ToastViewport />

      <div className={s.toolbar}>
        <SearchInput
          value={params.q}
          onChange={(value) => setParams({ q: value, page: '1' })}
          placeholder="Rechercher par nom ou e-mail…"
        />
        <FilterChips
          options={ROLE_OPTIONS}
          value={role}
          onChange={(value) => setParams({ role: value, page: '1' })}
          label="Filtrer par rôle"
        />
      </div>

      {error && (
        <div className={s.alert} role="alert" style={{ marginBottom: '1rem' }}>
          <Icon icon={CircleAlert} size={20} />
          <span className={s.alertText}>Impossible de charger les utilisateurs : {error}</span>
          <button type="button" className={cx(ui.btn, ui.small, s.tap, s.redGhost)} onClick={reload}>
            Réessayer
          </button>
        </div>
      )}

      {!(error && !data) && (
        <>
          <DataTable
            columns={COLUMNS}
            rows={rows}
            loading={loading || !ready}
            sort={sort}
            onSort={handleSort}
            rowHref={(r) => `/admin/users/${r.id}`}
            caption="Liste des utilisateurs"
            empty={
              <>
                <span className={s.stateIcon} aria-hidden="true">
                  <Icon icon={Search} size={28} />
                </span>
                {hasFilters ? 'Aucun utilisateur ne correspond à ces filtres.' : 'Aucun utilisateur pour le moment.'}
                {hasFilters && (
                  <button
                    type="button"
                    className={cx(ui.btn, ui.small, s.tap, s.blueGhost)}
                    onClick={() => setParams({ q: '', role: 'all', page: '1' })}
                    style={{ marginTop: '0.5rem' }}
                  >
                    Effacer les filtres
                  </button>
                )}
              </>
            }
          />
          {data && (
            <Pagination
              page={page}
              perPage={PER_PAGE}
              total={data.total || 0}
              onPage={(p) => {
                setParams({ page: String(p) })
                if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
              }}
              disabled={loading}
            />
          )}
        </>
      )}

      <InviteModal open={inviteOpen} onClose={() => setInviteOpen(false)} onInvited={reload} />
    </AdminShell>
  )
}
