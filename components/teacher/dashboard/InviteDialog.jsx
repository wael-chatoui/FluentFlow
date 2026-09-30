import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { CircleCheck, Hand, Link2, Mail, TriangleAlert, X } from 'lucide-react'
import { api } from '@/utils/apiClient'
import Icon from '@/components/ui/Icon'
import Modal from '@/components/teacher/Modal'
import CopyField from '@/components/teacher/CopyField'
import LinkShare from '@/components/teacher/students/LinkShare'
import { formatLongDate, formatRelative, isAbortError, studentDisplayName } from '@/components/teacher/format'
import { useMountedRef } from '@/components/teacher/hooks'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/dashboard/InviteDialog.module.css'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMPTY = { email: '', fullName: '', sendEmail: false }
const PROVIDERS = { google: 'avec Google', email: 'par e-mail' }
// The API answers email_exists for any existing account (approved, pending or teacher);
// pending_exists when it can tell that the account is an access request.
const EXISTS_CODES = ['email_exists', 'pending_exists']

function inviteError(err, sendEmail) {
  if (err?.code === 'rate_limited' && sendEmail) {
    return "Trop d'e-mails envoyés pour le moment. Décoche « Envoyer l'invitation par e-mail » pour obtenir un lien à copier dans le chat Preply."
  }
  return err?.message || "L'invitation a échoué."
}

/** Account already there: the access request to accept, or where to find a sign-in link. */
function ExistingAccount({ request, approving, error, onApprove }) {
  if (!request) {
    return (
      <div className={`${bits.alert} ${bits.error}`} role="alert">
        <span className={bits.alertIcon}>
          <Icon icon={TriangleAlert} size={20} />
        </span>
        <span className={bits.alertBody}>
          Un compte existe déjà avec cette adresse. Si cette personne a demandé l&apos;accès elle-même, accepte sa
          demande dans « À traiter ». Si c&apos;est déjà un de tes élèves, ouvre sa fiche et utilise « Copier un lien
          de connexion ».
        </span>
      </div>
    )
  }
  return (
    <div className={`${bits.alert} ${bits.warning}`} role="alert">
      <span className={bits.alertIcon}>
        <Icon icon={Hand} size={20} />
      </span>
      <div className={bits.alertBody}>
        <span>
          <strong>{studentDisplayName(request)}</strong> a déjà demandé l&apos;accès
          {PROVIDERS[request.provider] ? ` (inscription ${PROVIDERS[request.provider]})` : ''} : son compte attend ton
          accord, pas besoin d&apos;invitation.
        </span>
        {error && <span className={bits.fieldError}>{error}</span>}
        <div className={bits.alertActions}>
          <button
            type="button"
            className={`${ui.btn} ${ui.small} ${ui.green} ${bits.tap}`}
            onClick={onApprove}
            disabled={approving}
            aria-busy={approving || undefined}
          >
            {approving && <span className={bits.spinner} aria-hidden="true" />} Accepter sa demande
          </button>
        </div>
      </div>
    </div>
  )
}


/** « Lien d'invitation (sans e-mail) » | « Par e-mail » */
function ModeSwitch({ mode, onChange, disabled }) {
  return (
    <div className={styles.modes} role="group" aria-label="Type d'invitation">
      <button
        type="button"
        className={`${styles.mode} ${mode === 'link' ? styles.modeOn : ''}`}
        aria-pressed={mode === 'link'}
        onClick={() => onChange('link')}
        disabled={disabled}
      >
        <Icon icon={Link2} size={18} /> Lien d&apos;invitation <span className={styles.modeHint}>(sans e-mail)</span>
      </button>
      <button
        type="button"
        className={`${styles.mode} ${mode === 'email' ? styles.modeOn : ''}`}
        aria-pressed={mode === 'email'}
        onClick={() => onChange('email')}
        disabled={disabled}
      >
        <Icon icon={Mail} size={18} /> Par e-mail
      </button>
    </div>
  )
}

const LINK_STATUS = {
  active: { label: 'Actif', tone: 'active' },
  used: { label: 'Utilisé', tone: 'used' },
  expired: { label: 'Expiré', tone: 'off' },
  revoked: { label: 'Annulé', tone: 'off' },
}

/** Recent join links (GET /api/teacher/join-links) + revoke. Loaded while the dialog is open. */
function useJoinLinks(open) {
  const mounted = useMountedRef()
  const [items, setItems] = useState(null)
  const [error, setError] = useState(null)
  const [revoking, setRevoking] = useState(null)
  const [revokeError, setRevokeError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const res = await api('/api/teacher/join-links')
      if (!mounted.current) return
      setItems(res.joinLinks || [])
      setError(null)
    } catch (err) {
      if (!isAbortError(err) && mounted.current) setError(err?.message || 'Impossible de charger les liens.')
    }
  }, [mounted])

  useEffect(() => {
    if (open) refresh()
  }, [open, refresh])

  const revoke = useCallback(
    async (id) => {
      setRevoking(id)
      setRevokeError(null)
      try {
        await api(`/api/teacher/join-links/${id}`, { method: 'DELETE' })
        if (mounted.current) await refresh()
      } catch (err) {
        if (!isAbortError(err) && mounted.current) setRevokeError(err?.message || "L'annulation a échoué.")
      } finally {
        if (mounted.current) setRevoking(null)
      }
    },
    [mounted, refresh]
  )

  return { items, error, revoking, revokeError, revoke, refresh }
}

function linkDetail(item) {
  if (item.status === 'used') {
    const who = item.used_by?.name || item.used_by?.email
    return `${who ? `par ${who}, ` : ''}${formatRelative(item.used_at)}`
  }
  if (item.status === 'active') return `expire le ${formatLongDate(item.expires_at)}`
  if (item.status === 'revoked') return formatRelative(item.revoked_at)
  return `le ${formatLongDate(item.expires_at)}`
}

/** « Liens d'invitation » : state of the recent links, « Annuler » on the active ones. */
function JoinLinkList({ items, error, revoking, revokeError, revoke }) {
  const titleId = useId()
  if (!items && !error) return null
  return (
    <section className={styles.links} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.linksTitle}>
        Liens d&apos;invitation
      </h3>
      {error && <p className={bits.fieldError}>{error}</p>}
      {revokeError && (
        <p className={bits.fieldError} role="alert">
          {revokeError}
        </p>
      )}
      {items && !items.length && <p className={styles.linksEmpty}>Aucun lien pour l&apos;instant.</p>}
      {items && items.length > 0 && (
        <ul className={styles.linkList}>
          {items.map((item) => {
            const status = LINK_STATUS[item.status] || LINK_STATUS.expired
            const name = item.label || 'Sans prénom'
            return (
              <li key={item.id} className={styles.linkItem}>
                <span className={styles.linkMain}>
                  <span className={styles.linkName}>{name}</span>
                  <span className={styles.linkMeta}>
                    <span className={`${styles.badge} ${styles[status.tone]}`}>{status.label}</span> {linkDetail(item)}
                  </span>
                </span>
                {item.status === 'active' && (
                  <button
                    type="button"
                    className={`${ui.btn} ${ui.small} ${bits.redGhost} ${bits.tap}`}
                    onClick={() => revoke(item.id)}
                    disabled={revoking !== null}
                    aria-busy={revoking === item.id || undefined}
                  >
                    <Icon icon={X} size={16} /> Annuler
                    <span className="sr-only"> le lien {name}</span>
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}

/**
 * « Inviter un élève ». Default: « Lien d'invitation (sans e-mail) », a one-time join link
 * (POST /api/teacher/join-links) + a message to paste in the Preply chat, with the list of
 * recent links (state, « Annuler »). Secondary: « Par e-mail », creates the account for a
 * known address and shows its single-use link, or lets Supabase email the invitation.
 * An address that already asked for access (pending account, listed in « À traiter ») is
 * accepted from here instead.
 * @param {{ open: boolean, onClose: () => void, onInvited: (student: object) => void,
 *   pending?: { id: string, email: string, full_name?: string, provider?: string }[],
 *   onApproved?: (request: object) => void, onEmailExists?: () => void }} props
 *   pending: the dashboard's access requests; onEmailExists: the address already has an
 *   account (the dashboard refreshes « À traiter », which may not list it yet)
 */
export default function InviteDialog({ open, onClose, onInvited, pending = [], onApproved, onEmailExists }) {
  const uid = useId()
  const mounted = useMountedRef()
  const [mode, setMode] = useState('link') // 'link' (no email needed) | 'email'
  const [label, setLabel] = useState('')
  const [linkBusy, setLinkBusy] = useState(false)
  const [linkError, setLinkError] = useState(null)
  const [joinLink, setJoinLink] = useState(null) // { link, message, joinLink }
  const links = useJoinLinks(open)
  const [values, setValues] = useState(EMPTY)
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [approving, setApproving] = useState(false)
  const [error, setError] = useState(null)
  const [existing, setExisting] = useState(null) // email that already has an account
  const [approveError, setApproveError] = useState(null)
  const [result, setResult] = useState(null) // { student, link, sentEmail } | { approved }
  const doneRef = useRef(null)

  // The form is replaced by the result: move focus into it
  useEffect(() => {
    if (result || joinLink) doneRef.current?.focus()
  }, [result, joinLink])

  const reset = () => {
    setLabel('')
    setLinkError(null)
    setJoinLink(null)
    setValues(EMPTY)
    setAttempted(false)
    setError(null)
    setExisting(null)
    setApproveError(null)
    setResult(null)
  }

  const inviteAnother = () => {
    reset()
    requestAnimationFrame(() => document.getElementById(mode === 'link' ? `${uid}-label` : `${uid}-email`)?.focus())
  }

  const locked = busy || approving || linkBusy

  const close = () => {
    if (locked) return
    reset()
    setMode('link')
    onClose()
  }

  const switchMode = (next) => {
    if (locked || next === mode) return
    setError(null)
    setLinkError(null)
    setMode(next)
  }

  // « Lien d'invitation » : no email address needed, single use, 14 days
  const createLink = async (e) => {
    e.preventDefault()
    if (locked) return
    setLinkBusy(true)
    setLinkError(null)
    try {
      const body = label.trim() ? { label: label.trim() } : {}
      const res = await api('/api/teacher/join-links', { method: 'POST', body })
      if (!mounted.current) return
      setJoinLink(res)
      links.refresh()
    } catch (err) {
      if (!isAbortError(err) && mounted.current) setLinkError(err?.message || "La création du lien a échoué.")
    } finally {
      if (mounted.current) setLinkBusy(false)
    }
  }

  const email = values.email.trim()
  const emailError = !email ? "Indique l'adresse e-mail de l'élève." : !EMAIL_RE.test(email) ? 'Adresse e-mail invalide.' : null
  // Shown while the typed address is the one that already has an account
  const existingShown = existing && existing === email.toLowerCase() ? existing : null
  const request = existingShown ? pending.find((p) => (p.email || '').toLowerCase() === existingShown) || null : null

  const submit = async (e) => {
    e.preventDefault()
    if (locked) return
    setAttempted(true)
    if (emailError) {
      document.getElementById(`${uid}-email`)?.focus()
      return
    }
    setBusy(true)
    setError(null)
    setExisting(null)
    setApproveError(null)
    try {
      const body = { email, sendEmail: values.sendEmail }
      if (values.fullName.trim()) body.fullName = values.fullName.trim()
      const res = await api('/api/teacher/students/invite', { method: 'POST', body })
      if (!mounted.current) return
      setResult({ student: res.student, link: res.link || null, sentEmail: values.sendEmail })
      if (res.student) onInvited(res.student)
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      if (EXISTS_CODES.includes(err?.code)) {
        setExisting(email.toLowerCase())
        onEmailExists?.()
      } else {
        setError(inviteError(err, values.sendEmail))
      }
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  // Same action as « Accepter » in « À traiter »
  const approve = async () => {
    if (!request || locked) return
    setApproving(true)
    setApproveError(null)
    try {
      await api(`/api/teacher/students/${request.id}/approve`, { method: 'POST' })
      if (!mounted.current) return
      setResult({ approved: request })
      onApproved?.(request)
    } catch (err) {
      if (!isAbortError(err) && mounted.current) setApproveError(err.message || "L'acceptation a échoué.")
    } finally {
      if (mounted.current) setApproving(false)
    }
  }

  return (
    <Modal
      open={open}
      title={result?.approved ? 'Accès accordé' : result ? 'Invitation prête' : joinLink ? 'Lien prêt' : 'Inviter un élève'}
      icon={<Icon icon={result?.approved ? Hand : result || joinLink ? CircleCheck : mode === 'link' ? Link2 : Mail} size={22} />}
      onClose={close}
      busy={locked}
    >
      {joinLink ? (
        <div className={styles.body}>
          <p className={styles.lead}>
            Envoie ce lien{joinLink.joinLink?.label ? <> à <strong>{joinLink.joinLink.label}</strong></> : null} dans le chat
            Preply. Il se connecte avec Google ou son e-mail, remplit son profil et arrive dans son espace. Valable une
            fois, jusqu&apos;au {formatLongDate(joinLink.joinLink?.expires_at)}.
          </p>
          <div className={styles.share}>
            <CopyField
              label="Lien d'invitation"
              value={joinLink.link}
              hint="À usage unique : envoie-le seulement à cet élève."
            />
            {/* The student area is in English: so is the message */}
            <CopyField label="Message à coller dans le chat Preply" value={joinLink.message} multiline lang="en" />
          </div>
          <JoinLinkList {...links} />
          <div className={styles.actions}>
            <button type="button" className={`${ui.btn} ${bits.blueGhost}`} onClick={inviteAnother}>
              Créer un autre lien
            </button>
            <button ref={doneRef} type="button" className={`${ui.btn} ${ui.green}`} onClick={close}>
              Terminé
            </button>
          </div>
        </div>
      ) : !result && mode === 'link' ? (
        <form className={styles.body} onSubmit={createLink} noValidate>
          <ModeSwitch mode={mode} onChange={switchMode} disabled={locked} />
          <p className={styles.lead}>
            Pas besoin de son adresse e-mail : crée un lien, colle-le dans le chat Preply, l&apos;élève crée son compte en
            suivant les étapes.
          </p>
          <fieldset className={styles.fieldset} disabled={locked}>
            <legend className="sr-only">Lien d&apos;invitation</legend>
            <div>
              <label htmlFor={`${uid}-label`} className={bits.label}>
                Prénom de l&apos;élève <span className={bits.optional}>(facultatif)</span>
              </label>
              <input
                id={`${uid}-label`}
                className={bits.input}
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex. : Anxhela"
                autoComplete="off"
                maxLength={60}
                aria-describedby={`${uid}-label-hint`}
              />
              <p id={`${uid}-label-hint`} className={bits.hint}>
                Utilisé dans le message d&apos;accueil et comme nom de son profil.
              </p>
            </div>
          </fieldset>
          {linkError && (
            <div className={`${bits.alert} ${bits.error}`} role="alert">
              <span className={bits.alertIcon}>
                <Icon icon={TriangleAlert} size={20} />
              </span>
              <span className={bits.alertBody}>{linkError}</span>
            </div>
          )}
          <div className={styles.actions}>
            <button type="button" className={ui.btn} onClick={close} disabled={locked}>
              Annuler
            </button>
            <button type="submit" className={`${ui.btn} ${ui.green}`} disabled={locked} aria-busy={linkBusy || undefined}>
              {linkBusy && <span className={bits.spinner} aria-hidden="true" />}
              {linkBusy ? 'Création…' : 'Créer le lien'}
            </button>
          </div>
          <JoinLinkList {...links} />
        </form>
      ) : result ? (
        <div className={styles.body}>
          {result.approved ? (
            <p className={styles.lead}>
              <strong>{studentDisplayName(result.approved)}</strong> a maintenant accès à son espace : il suffit de se
              reconnecter (avec Google, ou avec un lien de connexion demandé sur la page de connexion).
            </p>
          ) : (
            <>
              <p className={styles.lead}>
                Le compte de <strong>{result.student?.full_name || result.student?.email || email}</strong> est créé.{' '}
                {result.link
                  ? 'Envoie-lui ce lien dans le chat Preply : il arrivera directement dans son espace.'
                  : result.sentEmail
                    ? "L'invitation lui a été envoyée par e-mail. Si elle n'arrive pas, ouvre sa fiche et utilise « Copier un lien de connexion »."
                    : 'Ouvre sa fiche et utilise « Copier un lien de connexion » pour obtenir un lien à lui envoyer.'}
              </p>
              {(result.link || result.sentEmail) && (
                <LinkShare
                  kind="invite"
                  name={result.student?.full_name || values.fullName}
                  email={result.student?.email || email}
                  link={result.link}
                />
              )}
            </>
          )}
          <div className={styles.actions}>
            <button type="button" className={`${ui.btn} ${bits.blueGhost}`} onClick={inviteAnother}>
              Inviter un autre élève
            </button>
            <button ref={doneRef} type="button" className={`${ui.btn} ${ui.green}`} onClick={close}>
              Terminé
            </button>
          </div>
        </div>
      ) : (
        <form className={styles.body} onSubmit={submit} noValidate>
          <ModeSwitch mode={mode} onChange={switchMode} disabled={locked} />
          <p className={styles.lead}>
            Tu connais son adresse e-mail : crée le compte ici, puis envoie-lui le lien de connexion.
          </p>
          <fieldset className={styles.fieldset} disabled={locked}>
            <legend className="sr-only">Élève à inviter</legend>
            <div>
              <label htmlFor={`${uid}-email`} className={bits.label}>E-mail</label>
              <input
                id={`${uid}-email`}
                type="email"
                inputMode="email"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                className={`${bits.input} ${attempted && emailError ? bits.invalid : ''}`}
                value={values.email}
                onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))}
                placeholder="prenom.nom@exemple.com"
                aria-invalid={(attempted && Boolean(emailError)) || undefined}
                aria-describedby={attempted && emailError ? `${uid}-email-error` : undefined}
                maxLength={254}
                required
              />
              {attempted && emailError && (
                <p id={`${uid}-email-error`} className={bits.fieldError}>
                  <Icon icon={TriangleAlert} size={16} /> {emailError}
                </p>
              )}
            </div>
            <div>
              <label htmlFor={`${uid}-name`} className={bits.label}>
                Nom <span className={bits.optional}>(facultatif)</span>
              </label>
              <input
                id={`${uid}-name`}
                className={bits.input}
                value={values.fullName}
                onChange={(e) => setValues((v) => ({ ...v, fullName: e.target.value }))}
                placeholder="Prénom Nom"
                autoComplete="off"
                maxLength={120}
              />
            </div>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={values.sendEmail}
                onChange={(e) => setValues((v) => ({ ...v, sendEmail: e.target.checked }))}
              />
              <span>
                <span className={styles.checkTitle}>Envoyer l&apos;invitation par e-mail</span>
                <span className={styles.checkHint}>
                  Au lieu du lien à copier : l&apos;élève reçoit l&apos;invitation dans sa boîte mail (quelques envois
                  par heure au maximum).
                </span>
              </span>
            </label>
          </fieldset>
          {error && (
            <div className={`${bits.alert} ${bits.error}`} role="alert">
              <span className={bits.alertIcon}>
                <Icon icon={TriangleAlert} size={20} />
              </span>
              <span className={bits.alertBody}>{error}</span>
            </div>
          )}
          {existingShown && (
            <ExistingAccount request={request} approving={approving} error={approveError} onApprove={approve} />
          )}
          <div className={styles.actions}>
            <button type="button" className={ui.btn} onClick={close} disabled={locked}>
              Annuler
            </button>
            <button type="submit" className={`${ui.btn} ${ui.green}`} disabled={locked} aria-busy={busy || undefined}>
              {busy && <span className={bits.spinner} aria-hidden="true" />}
              {busy ? (values.sendEmail ? 'Envoi…' : 'Création…') : values.sendEmail ? "Envoyer l'invitation" : "Créer l'invitation"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  )
}
