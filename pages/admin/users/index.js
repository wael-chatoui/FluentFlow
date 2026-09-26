import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import AdminShell from '@/components/admin/AdminShell'
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
  displayName,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelative,
  initialsOf,
  isAbortError,
} from '@/components/admin/common/format'
import { api } from '@/utils/apiClient'
import ui from '@/components/ui/ui.module.css'
import s from '@/components/admin/common/admin.module.css'
import u from '@/components/admin/common/users.module.css'

const PER_PAGE = 50
const ROLES = ['all', 'student', 'teacher', 'admin']
const ROLE_OPTIONS = [
  { value: 'all', label: 'Tous' },
  { value: 'student', label: 'Élèves' },
  { value: 'teacher', label: 'Profs' },
  { value: 'admin', label: 'Admins' },
]
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Values used for client-side sorting of the current page
const SORT_VALUE = {
  full_name: (r) => displayName(r).toLocaleLowerCase('fr'),
  email: (r) => (r.email || '').toLowerCase(),
  role: (r) => `${r.is_admin ? 0 : 1}${r.role || ''}`,
  level: (r) => (r.level && r.level !== 'unknown' ? r.level : 'ZZ'),
  onboarded_at: (r) => r.onboarded_at || '',
  lesson_count: (r) => Number(r.lesson_count) || 0,
  session_count: (r) => Number(r.session_count) || 0,
  created_at: (r) => r.created_at || '',
  last_sign_in_at: (r) => r.last_sign_in_at || '',
}
const DESC_FIRST = new Set(['onboarded_at', 'lesson_count', 'session_count', 'created_at', 'last_sign_in_at'])

function firstParam(v) {
  return Array.isArray(v) ? v[0] : v
}

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
  { key: 'email', label: 'Email', render: (r) => <span style={{ overflowWrap: 'anywhere' }}>{r.email || '—'}</span> },
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
          <span aria-hidden="true">✅</span>
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

const EMPTY_INVITE = { email: '', fullName: '', role: 'student', isAdmin: false }

function InviteModal({ open, onClose, onInvited }) {
  const toast = useToast()
  const uid = useId()
  const emailRef = useRef(null)
  const controllerRef = useRef(null)
  const mounted = useRef(true)
  const [values, setValues] = useState(EMPTY_INVITE)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controllerRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    if (open) {
      setValues(EMPTY_INVITE)
      setTouched(false)
      setError(null)
    }
  }, [open])

  const email = values.email.trim()
  const emailError = !email ? "L'email est obligatoire." : EMAIL_RE.test(email) ? null : 'Adresse email invalide.'
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
      await api('/api/admin/users', {
        method: 'POST',
        body: {
          email,
          fullName: values.fullName.trim() || undefined,
          role: values.role,
          isAdmin: values.isAdmin,
        },
        signal: controller.signal,
      })
      if (!mounted.current) return
      toast.success(`Invitation envoyée à ${email}`)
      onInvited?.()
      onClose()
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      setError(err.message || "L'invitation a échoué.")
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title="Inviter un utilisateur"
      icon="✉️"
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
            {busy ? 'Envoi…' : "Envoyer l'invitation"}
          </button>
        </>
      }
    >
      <p style={{ margin: 0 }}>
        La personne recevra un email pour choisir son mot de passe et accéder à la plateforme.
      </p>
      <form id={formId} className={u.inviteForm} onSubmit={handleSubmit} noValidate>
        <fieldset className={u.fieldset} disabled={busy}>
          <legend className="sr-only">Nouvel utilisateur</legend>
          <div className={s.field}>
            <label htmlFor={id('email')} className={s.label}>
              Email
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
            <select id={id('role')} className={cx(s.input, s.select)} value={values.role} onChange={set('role')}>
              <option value="student">Élève</option>
              <option value="teacher">Prof</option>
            </select>
          </div>
          <label className={s.check}>
            <input type="checkbox" checked={values.isAdmin} onChange={set('isAdmin')} />
            <span>Accès au back office (admin)</span>
          </label>
        </fieldset>
        {error && (
          <div className={s.alert} role="alert">
            <span aria-hidden="true">⚠️</span>
            <span className={s.alertText}>{error}</span>
          </div>
        )}
      </form>
    </Modal>
  )
}

export default function AdminUsers() {
  const router = useRouter()
  const [inviteOpen, setInviteOpen] = useState(false)
  const [sort, setSort] = useState(null)

  const q = router.isReady ? (firstParam(router.query.q) || '').trim() : ''
  const roleParam = firstParam(router.query.role)
  const role = ROLES.includes(roleParam) ? roleParam : 'all'
  const page = Math.max(1, parseInt(firstParam(router.query.page), 10) || 1)

  const url = useMemo(() => {
    if (!router.isReady) return null
    const params = new URLSearchParams({ role, page: String(page), perPage: String(PER_PAGE) })
    if (q) params.set('q', q)
    return `/api/admin/users?${params}`
  }, [router.isReady, q, role, page])

  const { data, error, loading, reload } = useAdminQuery(url)

  const setParams = useCallback(
    (patch) => {
      const next = { q, role, page, ...patch }
      const query = {}
      if (next.q) query.q = next.q
      if (next.role && next.role !== 'all') query.role = next.role
      if (next.page > 1) query.page = String(next.page)
      router.replace({ pathname: router.pathname, query }, undefined, { shallow: true, scroll: false })
    },
    [router, q, role, page]
  )

  // Out-of-range page (e.g. after deletions) → back to the last page
  useEffect(() => {
    if (!data || loading || page === 1) return
    const lastPage = Math.max(1, Math.ceil((data.total || 0) / PER_PAGE))
    if (page > lastPage) setParams({ page: lastPage })
  }, [data, loading, page, setParams])

  const rows = useMemo(() => {
    const list = Array.isArray(data?.users) ? data.users : []
    if (!sort || !SORT_VALUE[sort.key]) return list
    const get = SORT_VALUE[sort.key]
    const factor = sort.dir === 'asc' ? 1 : -1
    return [...list].sort((a, b) => {
      const va = get(a)
      const vb = get(b)
      if (va < vb) return -1 * factor
      if (va > vb) return 1 * factor
      return 0
    })
  }, [data, sort])

  const handleSort = (key) => {
    setSort((prev) => {
      if (prev?.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      return { key, dir: DESC_FIRST.has(key) ? 'desc' : 'asc' }
    })
  }

  const hasFilters = Boolean(q) || role !== 'all'

  return (
    <AdminShell
      title="Utilisateurs"
      actions={
        <button type="button" className={cx(ui.btn, ui.green, ui.small, s.tap)} onClick={() => setInviteOpen(true)}>
          <span aria-hidden="true">➕</span> Inviter un utilisateur
        </button>
      }
    >
      <ToastViewport />

      <div className={s.toolbar}>
        <SearchInput
          value={q}
          onChange={(value) => setParams({ q: value, page: 1 })}
          placeholder="Rechercher par nom ou email…"
        />
        <FilterChips
          options={ROLE_OPTIONS}
          value={role}
          onChange={(value) => setParams({ role: value, page: 1 })}
          label="Filtrer par rôle"
        />
      </div>

      {error && (
        <div className={s.alert} role="alert" style={{ marginBottom: '1rem' }}>
          <span aria-hidden="true">⚠️</span>
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
            loading={loading || !router.isReady}
            sort={sort}
            onSort={handleSort}
            rowHref={(r) => `/admin/users/${r.id}`}
            caption="Liste des utilisateurs"
            empty={
              <>
                <span className={s.stateIcon} aria-hidden="true">
                  🔍
                </span>
                {hasFilters ? 'Aucun utilisateur ne correspond à ces filtres.' : 'Aucun utilisateur pour le moment.'}
                {hasFilters && (
                  <button
                    type="button"
                    className={cx(ui.btn, ui.small, s.tap, s.blueGhost)}
                    onClick={() => setParams({ q: '', role: 'all', page: 1 })}
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
                setParams({ page: p })
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
