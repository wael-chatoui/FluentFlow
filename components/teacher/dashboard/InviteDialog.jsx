import { useEffect, useId, useRef, useState } from 'react'
import { api } from '@/utils/apiClient'
import Modal from '@/components/teacher/Modal'
import LinkShare from '@/components/teacher/students/LinkShare'
import { isAbortError, studentDisplayName } from '@/components/teacher/format'
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
        <span className={bits.alertIcon} aria-hidden="true">⚠️</span>
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
      <span className={bits.alertIcon} aria-hidden="true">🙋</span>
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

/**
 * « Inviter un élève »: creates the account (invite-only access) and shows the single-use
 * link + a message to paste in the Preply chat, or lets Supabase email the invitation
 * instead of the link. An address that already asked for access (pending account, listed
 * in « À traiter ») is accepted from here instead.
 * @param {{ open: boolean, onClose: () => void, onInvited: (student: object) => void,
 *   pending?: { id: string, email: string, full_name?: string, provider?: string }[],
 *   onApproved?: (request: object) => void, onEmailExists?: () => void }} props
 *   pending: the dashboard's access requests; onEmailExists: the address already has an
 *   account (the dashboard refreshes « À traiter », which may not list it yet)
 */
export default function InviteDialog({ open, onClose, onInvited, pending = [], onApproved, onEmailExists }) {
  const uid = useId()
  const mounted = useMountedRef()
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
    if (result) doneRef.current?.focus()
  }, [result])

  const reset = () => {
    setValues(EMPTY)
    setAttempted(false)
    setError(null)
    setExisting(null)
    setApproveError(null)
    setResult(null)
  }

  const inviteAnother = () => {
    reset()
    requestAnimationFrame(() => document.getElementById(`${uid}-email`)?.focus())
  }

  const locked = busy || approving

  const close = () => {
    if (locked) return
    reset()
    onClose()
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
      title={result?.approved ? 'Accès accordé ✓' : result ? 'Invitation prête ✓' : 'Inviter un élève'}
      icon={result?.approved ? '🙋' : '✉️'}
      onClose={close}
      busy={locked}
    >
      {result ? (
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
          <p className={styles.lead}>
            L&apos;accès est sur invitation : crée le compte ici, puis envoie le lien à l&apos;élève.
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
                  <span aria-hidden="true">⚠️</span> {emailError}
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
              <span className={bits.alertIcon} aria-hidden="true">⚠️</span>
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
