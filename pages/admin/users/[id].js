import { useCallback, useEffect, useId, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '@/components/AuthProvider'
import AdminShell from '@/components/admin/AdminShell'
import DataTable from '@/components/admin/common/DataTable'
import ConfirmDialog from '@/components/admin/common/ConfirmDialog'
import StatusPill, { UserRolePills } from '@/components/admin/common/StatusPill'
import { ToastViewport, useToast } from '@/components/admin/common/Toast'
import useAdminQuery from '@/components/admin/common/useAdminQuery'
import {
  LEVEL_LABELS,
  cx,
  formatDate,
  formatDateTime,
  formatNumber,
  formatRelative,
  formatScore,
  initialsOf,
  isAbortError,
  isValidId,
} from '@/components/admin/common/format'
import { api } from '@/utils/apiClient'
import { LEVELS, safeDriveUrl } from '@/utils/lesson/schema'
import ui from '@/components/ui/ui.module.css'
import s from '@/components/admin/common/admin.module.css'
import u from '@/components/admin/common/users.module.css'

const PROVIDER_LABELS = { email: 'Email', google: 'Google', apple: 'Apple', github: 'GitHub', azure: 'Microsoft' }
const PROFILE_FIELDS = ['fullName', 'level', 'goals', 'interests', 'driveFolderUrl', 'notes']

function useMountedRef() {
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])
  return mounted
}

function useBeforeUnload(active) {
  useEffect(() => {
    if (!active) return undefined
    const handler = (e) => {
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [active])
}

function profileValues(profile, notes) {
  return {
    fullName: profile?.full_name || '',
    level: LEVELS.includes(profile?.level) ? profile.level : 'unknown',
    goals: profile?.goals || '',
    interests: profile?.interests || '',
    driveFolderUrl: profile?.drive_folder_url || '',
    notes: typeof notes === 'string' ? notes : notes?.notes || '',
  }
}

function driveUrlError(value) {
  const v = (value || '').trim()
  if (!v) return null
  return safeDriveUrl(v) ? null : 'Le lien doit commencer par https:// et pointer vers drive.google.com ou docs.google.com.'
}

function sameValues(a, b) {
  return PROFILE_FIELDS.every((k) => a[k] === b[k])
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------
function UserHeader({ user, profile, isSelf }) {
  const name = profile?.full_name?.trim() || ''
  const providers = Array.isArray(user.providers) ? user.providers : []
  return (
    <section className={s.section} aria-label="Identité">
      <div className={u.header}>
        <span className={u.avatar} aria-hidden="true">
          {initialsOf(name || user.email)}
        </span>
        <div className={u.headerMain}>
          <h2 className={u.headerName}>
            {name || <span className={s.muted}>Sans nom</span>}
            {isSelf && (
              <>
                {' '}
                <StatusPill tone="gray">C&apos;est toi</StatusPill>
              </>
            )}
          </h2>
          <p className={u.headerEmail}>{user.email || '—'}</p>
          <span className={s.pills}>
            <UserRolePills user={user} />
            {providers.map((p) => (
              <StatusPill key={p} tone="gray">
                <span aria-hidden="true">🔑</span> {PROVIDER_LABELS[p] || p}
              </StatusPill>
            ))}
          </span>
        </div>
        <dl className={u.meta}>
          <div>
            <dt>Inscrit le</dt>
            <dd title={formatDateTime(user.created_at)}>{formatDate(user.created_at)}</dd>
          </div>
          <div>
            <dt>Dernière connexion</dt>
            <dd title={user.last_sign_in_at ? formatDateTime(user.last_sign_in_at) : undefined}>
              {user.last_sign_in_at ? formatRelative(user.last_sign_in_at) : 'Jamais'}
            </dd>
          </div>
          <div>
            <dt>Onboarding</dt>
            <dd>{profile?.onboarded_at ? `Terminé le ${formatDate(profile.onboarded_at)}` : 'Non terminé'}</dd>
          </div>
          <div>
            <dt>Identifiant</dt>
            <dd className={s.mono}>{user.id}</dd>
          </div>
        </dl>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Compte
// ---------------------------------------------------------------------------
function AccountSection({ user, profile, isSelf, busyKey, onPatch, askConfirm }) {
  const uid = useId()
  const currentRole = user.role === 'teacher' ? 'teacher' : 'student'
  const [role, setRole] = useState(currentRole)

  useEffect(() => setRole(currentRole), [currentRole])

  const busy = Boolean(busyKey)
  const selfHint = 'Tu ne peux pas modifier ton propre compte ici.'

  return (
    <section className={s.section} aria-labelledby={`${uid}-title`}>
      <div className={s.sectionHead}>
        <h2 id={`${uid}-title`} className={s.sectionTitle}>
          <span aria-hidden="true">⚙️</span> Compte
        </h2>
      </div>
      <div className={u.accountRows}>
        <div className={u.accountRow}>
          <div className={u.accountText}>
            <label htmlFor={`${uid}-role`} className={u.accountTitle}>
              Rôle
            </label>
            <p className={s.hint} id={`${uid}-role-hint`}>
              {isSelf ? 'Tu ne peux pas modifier ton propre rôle.' : 'Élève : espace élève. Prof : espace prof.'}
            </p>
          </div>
          <div className={u.accountControl}>
            <select
              id={`${uid}-role`}
              className={cx(s.input, s.select, u.roleSelect)}
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={isSelf || busy}
              aria-describedby={`${uid}-role-hint`}
            >
              <option value="student">Élève</option>
              <option value="teacher">Prof</option>
            </select>
            {role !== currentRole && !isSelf && (
              <button
                type="button"
                className={cx(ui.btn, ui.blue, ui.small, s.tap)}
                disabled={busy}
                aria-busy={busyKey === 'role' || undefined}
                onClick={() =>
                  onPatch('role', { role }, `Rôle mis à jour : ${role === 'teacher' ? 'Prof' : 'Élève'}`).catch(() =>
                    setRole(currentRole)
                  )
                }
              >
                {busyKey === 'role' && <span className={s.spinner} aria-hidden="true" />}
                Appliquer
              </button>
            )}
          </div>
        </div>

        <div className={u.accountRow}>
          <div className={u.accountText}>
            <span className={u.accountTitle} id={`${uid}-admin-label`}>
              Administrateur
            </span>
            <p className={s.hint} id={`${uid}-admin-hint`}>
              {isSelf ? 'Tu ne peux pas retirer ton propre accès admin.' : 'Donne accès à ce back office.'}
            </p>
          </div>
          <div className={u.accountControl}>
            <label className={cx(u.switch, (isSelf || busy) && u.switchDisabled)}>
              <input
                type="checkbox"
                role="switch"
                checked={Boolean(user.is_admin)}
                disabled={isSelf || busy}
                aria-labelledby={`${uid}-admin-label`}
                aria-describedby={`${uid}-admin-hint`}
                onChange={(e) => {
                  const next = e.target.checked
                  askConfirm({
                    title: next ? 'Donner l’accès admin ?' : 'Retirer l’accès admin ?',
                    message: next
                      ? 'Cette personne pourra voir et modifier toutes les données du back office.'
                      : 'Cette personne n’aura plus accès au back office.',
                    confirmLabel: next ? 'Donner l’accès' : 'Retirer l’accès',
                    tone: next ? 'primary' : 'danger',
                    icon: '🛠️',
                    key: 'admin',
                    body: { isAdmin: next },
                    success: next ? 'Accès admin accordé' : 'Accès admin retiré',
                  })
                }}
              />
              <span className={u.track} aria-hidden="true" />
              <span>{user.is_admin ? 'Oui' : 'Non'}</span>
            </label>
          </div>
        </div>

        <div className={u.accountRow}>
          <div className={u.accountText}>
            <span className={u.accountTitle}>{user.banned ? 'Compte banni' : 'Bannissement'}</span>
            <p className={s.hint}>
              {isSelf
                ? 'Tu ne peux pas te bannir toi-même.'
                : user.banned
                  ? 'Cette personne ne peut plus se connecter.'
                  : 'Empêche la personne de se connecter (réversible).'}
            </p>
          </div>
          <div className={u.accountControl}>
            <button
              type="button"
              className={cx(ui.btn, ui.small, s.tap, user.banned ? s.blueGhost : s.redGhost)}
              disabled={isSelf || busy}
              aria-busy={busyKey === 'ban' || undefined}
              onClick={() =>
                askConfirm(
                  user.banned
                    ? {
                        title: 'Débannir ce compte ?',
                        message: 'La personne pourra de nouveau se connecter.',
                        confirmLabel: 'Débannir',
                        tone: 'primary',
                        icon: '🔓',
                        key: 'ban',
                        body: { banned: false },
                        success: 'Compte débanni',
                      }
                    : {
                        title: 'Bannir ce compte ?',
                        message: (
                          <>
                            <strong>{user.email}</strong> ne pourra plus se connecter. Ses données sont conservées et tu
                            pourras le débannir à tout moment.
                          </>
                        ),
                        confirmLabel: 'Bannir',
                        tone: 'danger',
                        icon: '⛔',
                        key: 'ban',
                        body: { banned: true },
                        success: 'Compte banni',
                      }
                )
              }
            >
              {busyKey === 'ban' && <span className={s.spinner} aria-hidden="true" />}
              {user.banned ? 'Débannir' : 'Bannir'}
            </button>
          </div>
        </div>

        <div className={u.accountRow}>
          <div className={u.accountText}>
            <span className={u.accountTitle}>Onboarding</span>
            <p className={s.hint}>
              {profile?.onboarded_at
                ? `Terminé le ${formatDate(profile.onboarded_at)}. Le réinitialiser relance le questionnaire à la prochaine connexion.`
                : 'Pas encore terminé.'}
            </p>
          </div>
          <div className={u.accountControl}>
            <button
              type="button"
              className={cx(ui.btn, ui.small, s.tap, s.blueGhost)}
              disabled={busy || !profile?.onboarded_at}
              aria-busy={busyKey === 'onboarding' || undefined}
              onClick={() =>
                askConfirm({
                  title: 'Réinitialiser l’onboarding ?',
                  message: 'La personne devra refaire le questionnaire d’accueil à sa prochaine connexion.',
                  confirmLabel: 'Réinitialiser',
                  tone: 'primary',
                  icon: '🔄',
                  key: 'onboarding',
                  body: { resetOnboarding: true },
                  success: 'Onboarding réinitialisé',
                })
              }
            >
              {busyKey === 'onboarding' && <span className={s.spinner} aria-hidden="true" />}
              Réinitialiser
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Profil
// ---------------------------------------------------------------------------
function ProfileSection({ userId, profile, notes, onSaved }) {
  const mounted = useMountedRef()
  const uid = useId()
  const controllerRef = useRef(null)
  const savedTimer = useRef(null)
  const [initial, setInitial] = useState(() => profileValues(profile, notes))
  const [values, setValues] = useState(initial)
  const [driveTouched, setDriveTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [justSaved, setJustSaved] = useState(false)

  const changed = PROFILE_FIELDS.filter((k) => values[k] !== initial[k])
  const dirty = changed.length > 0

  // Server data changed elsewhere (e.g. role PATCH) → refresh the form if untouched
  useEffect(() => {
    const next = profileValues(profile, notes)
    if (sameValues(next, initial)) return
    if (sameValues(values, initial)) setValues(next)
    setInitial(next)
    // Only react to server data changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, notes])

  useEffect(
    () => () => {
      controllerRef.current?.abort()
      clearTimeout(savedTimer.current)
    },
    []
  )

  useBeforeUnload(dirty)

  const driveError = driveUrlError(values.driveFolderUrl)
  const showDriveError = Boolean(driveError) && driveTouched

  const set = (key) => (e) => {
    const { value } = e.target
    setValues((v) => ({ ...v, [key]: value }))
    setJustSaved(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (saving || !dirty) return
    if (driveError) {
      setDriveTouched(true)
      document.getElementById(`${uid}-drive`)?.focus()
      return
    }
    const body = {}
    changed.forEach((key) => {
      body[key] = key === 'driveFolderUrl' ? safeDriveUrl(values[key].trim()) : values[key]
    })

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setSaving(true)
    setError(null)
    try {
      const data = await api(`/api/admin/users/${userId}`, { method: 'PATCH', body, signal: controller.signal })
      if (!mounted.current) return
      const next = data?.user ? profileValues(data.profile, data.notes) : { ...values }
      setInitial(next)
      setValues(next)
      setDriveTouched(false)
      setJustSaved(true)
      clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => {
        if (mounted.current) setJustSaved(false)
      }, 4000)
      if (data?.user) onSaved(data)
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      setError(err.message || "L'enregistrement a échoué.")
    } finally {
      if (mounted.current) setSaving(false)
    }
  }

  const id = (name) => `${uid}-${name}`

  return (
    <section className={s.section} aria-labelledby={id('title')}>
      <div className={s.sectionHead}>
        <h2 id={id('title')} className={s.sectionTitle}>
          <span aria-hidden="true">📝</span> Profil
        </h2>
      </div>
      <form className={u.form} onSubmit={handleSubmit} noValidate>
        <fieldset className={u.fieldset} disabled={saving}>
          <legend className="sr-only">Profil</legend>
          <div className={u.row}>
            <div className={s.field}>
              <label htmlFor={id('name')} className={s.label}>
                Nom
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
              <label htmlFor={id('level')} className={s.label}>
                Niveau
              </label>
              <select id={id('level')} className={cx(s.input, s.select)} value={values.level} onChange={set('level')}>
                {LEVELS.map((level) => (
                  <option key={level} value={level}>
                    {LEVEL_LABELS[level] || level}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className={s.field}>
            <label htmlFor={id('goals')} className={s.label}>
              <span aria-hidden="true">🎯 </span>Objectifs
            </label>
            <textarea
              id={id('goals')}
              className={cx(s.input, s.textarea)}
              rows={3}
              value={values.goals}
              onChange={set('goals')}
            />
          </div>

          <div className={s.field}>
            <label htmlFor={id('interests')} className={s.label}>
              <span aria-hidden="true">💡 </span>Centres d&apos;intérêt
            </label>
            <textarea
              id={id('interests')}
              className={cx(s.input, s.textarea)}
              rows={3}
              value={values.interests}
              onChange={set('interests')}
            />
          </div>

          <div className={s.field}>
            <label htmlFor={id('drive')} className={s.label}>
              <span aria-hidden="true">📁 </span>Dossier Google Drive
            </label>
            <input
              id={id('drive')}
              type="url"
              inputMode="url"
              className={cx(s.input, showDriveError && s.invalid)}
              value={values.driveFolderUrl}
              onChange={set('driveFolderUrl')}
              onBlur={() => setDriveTouched(true)}
              placeholder="https://drive.google.com/drive/folders/…"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-invalid={showDriveError || undefined}
              aria-describedby={showDriveError ? id('drive-error') : id('drive-hint')}
            />
            {showDriveError ? (
              <p id={id('drive-error')} className={s.fieldError} role="alert">
                {driveError}
              </p>
            ) : (
              <p id={id('drive-hint')} className={s.hint}>
                {safeDriveUrl(values.driveFolderUrl.trim()) ? (
                  <a href={safeDriveUrl(values.driveFolderUrl.trim())} target="_blank" rel="noopener noreferrer" className={s.link}>
                    Ouvrir le dossier ↗
                  </a>
                ) : (
                  'Laisse vide pour retirer le lien.'
                )}
              </p>
            )}
          </div>

          <div className={cx(s.field, u.private)}>
            <label htmlFor={id('notes')} className={s.label}>
              <span aria-hidden="true">🔒 </span>Notes privées
            </label>
            <textarea
              id={id('notes')}
              className={cx(s.input, s.textarea)}
              rows={5}
              value={values.notes}
              onChange={set('notes')}
              aria-describedby={id('notes-hint')}
            />
            <p id={id('notes-hint')} className={cx(s.hint, u.hint)}>
              Visibles uniquement par le prof et utilisées par l&apos;IA pour personnaliser les leçons.
            </p>
          </div>
        </fieldset>

        {error && (
          <div className={s.alert} role="alert">
            <span aria-hidden="true">⚠️</span>
            <span className={s.alertText}>{error}</span>
          </div>
        )}

        <div className={cx(u.formFooter, (dirty || saving) && u.formFooterSticky)}>
          <div className={u.formStatus} role="status" aria-live="polite">
            {saving ? (
              'Enregistrement…'
            ) : justSaved && !dirty ? (
              <span className={u.saved}>Enregistré ✓</span>
            ) : dirty ? (
              <span className={u.dirty}>Modifications non enregistrées</span>
            ) : null}
          </div>
          <div className={u.formButtons}>
            {dirty && !saving && (
              <button
                type="button"
                className={cx(ui.btn, ui.small, s.tap)}
                onClick={() => {
                  setValues(initial)
                  setDriveTouched(false)
                  setError(null)
                }}
              >
                Annuler
              </button>
            )}
            <button
              type="submit"
              className={cx(ui.btn, ui.green, ui.small, s.tap)}
              disabled={!dirty || saving}
              aria-busy={saving || undefined}
            >
              {saving && <span className={s.spinner} aria-hidden="true" />}
              {saving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </form>
    </section>
  )
}

// ---------------------------------------------------------------------------
// Activity lists
// ---------------------------------------------------------------------------
const LESSON_COLUMNS = [
  {
    key: 'title',
    label: 'Leçon',
    render: (l) => (
      <>
        <span className={s.cellStrong}>{l.title || 'Leçon sans titre'}</span>
        <span className={s.cellSub}>{formatDate(l.lesson_date)}</span>
      </>
    ),
  },
  { key: 'status', label: 'Statut', render: (l) => <StatusPill status={l.status} /> },
  { key: 'exercise_count', label: 'Exercices', align: 'right', render: (l) => <span className={s.num}>{formatNumber(l.exercise_count || 0)}</span> },
  {
    key: 'best',
    label: 'Meilleur score',
    align: 'right',
    render: (l) => <span className={cx(s.num, s.nowrap)}>{formatScore(l.best_score, l.best_total)}</span>,
  },
  { key: 'attempts', label: 'Tentatives', align: 'right', render: (l) => <span className={s.num}>{formatNumber(l.attempts || 0)}</span> },
]

const SESSION_COLUMNS = [
  { key: 'lesson_title', label: 'Leçon', render: (r) => <span className={s.cellStrong}>{r.lesson_title || 'Leçon supprimée'}</span> },
  { key: 'score', label: 'Score', align: 'right', render: (r) => <span className={cx(s.num, s.nowrap)}>{formatScore(r.score, r.total)}</span> },
  {
    key: 'completed_at',
    label: 'Terminée',
    render: (r) => (
      <span className={s.nowrap} title={formatDateTime(r.completed_at)}>
        {formatRelative(r.completed_at)}
      </span>
    ),
  },
]

const REVIEW_COLUMNS = [
  { key: 'exercise_id', label: 'Exercice', render: (r) => <span className={s.mono}>{r.exercise_id || '—'}</span> },
  {
    key: 'correct',
    label: 'Résultat',
    render: (r) =>
      r.correct ? <StatusPill tone="green">✓ Correct</StatusPill> : <StatusPill tone="red">✗ Incorrect</StatusPill>,
  },
  {
    key: 'created_at',
    label: 'Date',
    render: (r) => (
      <span className={s.nowrap} title={formatDateTime(r.created_at)}>
        {formatRelative(r.created_at)}
      </span>
    ),
  },
]

function ListSection({ icon, title, count, sub, children }) {
  const uid = useId()
  return (
    <section className={s.section} aria-labelledby={uid}>
      <div className={s.sectionHead}>
        <h2 id={uid} className={s.sectionTitle}>
          <span aria-hidden="true">{icon}</span> {title}
          {typeof count === 'number' && <StatusPill tone="gray">{formatNumber(count)}</StatusPill>}
        </h2>
        {sub && <p className={s.sectionSub}>{sub}</p>}
      </div>
      {children}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
function DetailSkeleton() {
  return (
    <div className={s.stack} aria-hidden="true">
      <div className={s.section}>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span className={ui.skel} style={{ width: 64, height: 64, borderRadius: 20, flex: 'none' }} />
          <span style={{ flex: 1 }}>
            <span className={ui.skel} style={{ width: '45%', height: 20, marginBottom: 10 }} />
            <span className={ui.skel} style={{ width: '65%', height: 14 }} />
          </span>
        </div>
      </div>
      <div className={u.columns}>
        {[0, 1].map((i) => (
          <div key={i} className={s.section}>
            <span className={ui.skel} style={{ width: 120, height: 18, marginBottom: 18 }} />
            {[0, 1, 2, 3].map((j) => (
              <span key={j} className={ui.skel} style={{ width: '100%', height: 44, marginBottom: 12 }} />
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminUserDetail() {
  const router = useRouter()
  const toast = useToast()
  const mounted = useMountedRef()
  const { user: me } = useAuth()
  const rawId = router.isReady ? (Array.isArray(router.query.id) ? router.query.id[0] : router.query.id) : null
  const idOk = isValidId(rawId)

  const { data, error, loading, reload, setData } = useAdminQuery(idOk ? `/api/admin/users/${rawId}` : null)

  const controllerRef = useRef(null)
  const [busyKey, setBusyKey] = useState(null)
  const [confirm, setConfirm] = useState(null)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const user = data?.user
  const isSelf = Boolean(me?.id && user?.id && me.id === user.id)

  /** PATCH the user; resolves with the new data, rejects (after a toast) on error. */
  const patch = useCallback(
    async (key, body, successMessage) => {
      if (!idOk) throw new Error('Identifiant invalide')
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller
      setBusyKey(key)
      try {
        const next = await api(`/api/admin/users/${rawId}`, { method: 'PATCH', body, signal: controller.signal })
        if (!mounted.current) return next
        if (next?.user) setData(next)
        else reload()
        if (successMessage) toast.success(successMessage)
        return next
      } catch (err) {
        if (!isAbortError(err) && mounted.current) toast.error(err.message || 'La modification a échoué.')
        throw err
      } finally {
        if (mounted.current && controllerRef.current === controller) setBusyKey(null)
      }
    },
    [idOk, rawId, mounted, setData, reload, toast]
  )

  const handleConfirm = async () => {
    if (!confirm || busyKey) return
    try {
      await patch(confirm.key, confirm.body, confirm.success)
    } catch {
      // error already surfaced by patch()
    }
    if (mounted.current) setConfirm(null)
  }

  const handleDelete = async () => {
    if (deleting || !user) return
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setDeleting(true)
    try {
      await api(`/api/admin/users/${user.id}`, {
        method: 'DELETE',
        body: { confirmEmail: user.email },
        signal: controller.signal,
      })
      toast.success(`Compte ${user.email} supprimé`)
      if (mounted.current) setDeleteOpen(false)
      router.push('/admin/users')
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      toast.error(err.message || 'La suppression a échoué.')
    } finally {
      if (mounted.current) setDeleting(false)
    }
  }

  const title = user ? data?.profile?.full_name?.trim() || user.email || 'Utilisateur' : 'Utilisateur'
  const lessons = Array.isArray(data?.lessons) ? data.lessons : []
  const sessions = Array.isArray(data?.sessions) ? data.sessions : []
  const reviews = Array.isArray(data?.reviews) ? data.reviews : []
  const correctCount = reviews.filter((r) => r.correct).length

  let content
  if (router.isReady && !idOk) {
    content = (
      <div className={cx(s.section, s.errorState)}>
        <span className={s.stateIcon} aria-hidden="true">🤷</span>
        <p>Identifiant d&apos;utilisateur invalide.</p>
        <Link href="/admin/users" className={cx(ui.btn, ui.small, s.tap, s.blueGhost)}>
          Retour aux utilisateurs
        </Link>
      </div>
    )
  } else if (error && !data) {
    content = (
      <div className={cx(s.section, s.errorState)} role="alert">
        <span className={s.stateIcon} aria-hidden="true">⚠️</span>
        <p>Impossible de charger cet utilisateur : {error}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center' }}>
          <button type="button" className={cx(ui.btn, ui.small, s.tap, ui.blue)} onClick={reload}>
            Réessayer
          </button>
          <Link href="/admin/users" className={cx(ui.btn, ui.small, s.tap)}>
            Retour à la liste
          </Link>
        </div>
      </div>
    )
  } else if (!user) {
    content = <DetailSkeleton />
  } else {
    content = (
      <div className={s.stack}>
        {error && (
          <div className={s.alert} role="alert">
            <span aria-hidden="true">⚠️</span>
            <span className={s.alertText}>Actualisation impossible : {error}</span>
            <button type="button" className={cx(ui.btn, ui.small, s.tap, s.redGhost)} onClick={reload}>
              Réessayer
            </button>
          </div>
        )}

        <UserHeader user={user} profile={data.profile} isSelf={isSelf} />

        <div className={u.columns}>
          <AccountSection
            user={user}
            profile={data.profile}
            isSelf={isSelf}
            busyKey={busyKey}
            onPatch={patch}
            askConfirm={setConfirm}
          />
          <ProfileSection key={user.id} userId={user.id} profile={data.profile} notes={data.notes} onSaved={setData} />
        </div>

        <ListSection icon="📚" title="Leçons" count={lessons.length}>
          <DataTable
            columns={LESSON_COLUMNS}
            rows={lessons}
            rowHref={(l) => `/admin/lessons/${l.id}`}
            caption={`Leçons de ${title}`}
            maxHeight="480px"
            empty="Aucune leçon pour cet utilisateur."
          />
        </ListSection>

        <div className={u.columns}>
          <ListSection icon="🏋️" title="Sessions d'exercices" count={sessions.length} sub="50 dernières">
            <DataTable
              columns={SESSION_COLUMNS}
              rows={sessions}
              rowHref={(r) => (r.lesson_id ? `/admin/lessons/${r.lesson_id}` : null)}
              caption="Sessions d'exercices récentes"
              maxHeight="420px"
              empty="Aucune session d'exercices."
            />
          </ListSection>
          <ListSection
            icon="🔁"
            title="Révisions"
            count={reviews.length}
            sub={reviews.length ? `${correctCount}/${reviews.length} correctes · 50 dernières` : '50 dernières'}
          >
            <DataTable
              columns={REVIEW_COLUMNS}
              rows={reviews}
              rowHref={(r) => (r.lesson_id ? `/admin/lessons/${r.lesson_id}` : null)}
              caption="Révisions récentes"
              maxHeight="420px"
              empty="Aucune révision."
            />
          </ListSection>
        </div>

        <section className={cx(s.section, u.dangerZone)} aria-labelledby="danger-title">
          <div className={s.sectionHead}>
            <h2 id="danger-title" className={cx(s.sectionTitle, u.sectionTitleDanger)}>
              <span aria-hidden="true">☠️</span> Zone dangereuse
            </h2>
          </div>
          <div className={u.dangerRow}>
            <p>
              {isSelf
                ? 'Tu ne peux pas supprimer ton propre compte.'
                : 'Supprime définitivement le compte et toutes ses données (profil, leçons, sessions, révisions). Action irréversible.'}
            </p>
            <button
              type="button"
              className={cx(ui.btn, ui.red, ui.small, s.tap)}
              disabled={isSelf || deleting || Boolean(busyKey)}
              onClick={() => setDeleteOpen(true)}
            >
              <span aria-hidden="true">🗑️</span> Supprimer le compte
            </button>
          </div>
        </section>
      </div>
    )
  }

  return (
    <AdminShell
      title={title}
      actions={
        <Link href="/admin/users" className={cx(ui.btn, ui.small, s.tap, s.blueGhost)}>
          ← Utilisateurs
        </Link>
      }
    >
      <ToastViewport />
      <div aria-busy={loading || undefined}>{content}</div>

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirm?.title || ''}
        message={confirm?.message}
        confirmLabel={confirm?.confirmLabel}
        tone={confirm?.tone}
        icon={confirm?.icon}
        busy={Boolean(busyKey)}
        onConfirm={handleConfirm}
        onCancel={() => {
          if (!busyKey) setConfirm(null)
        }}
      />

      {user && (
        <ConfirmDialog
          open={deleteOpen}
          title="Supprimer ce compte ?"
          message={
            <>
              Le compte <strong>{user.email}</strong> et toutes ses données seront supprimés définitivement. Cette action
              est irréversible.
            </>
          }
          confirmLabel="Supprimer définitivement"
          tone="danger"
          icon="🗑️"
          requireText={user.email}
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => {
            if (!deleting) setDeleteOpen(false)
          }}
        />
      )}
    </AdminShell>
  )
}
