import { useState } from 'react'
import { api } from '@/utils/apiClient'
import { copyText } from '@/components/teacher/clipboard'
import LinkShare from '@/components/teacher/students/LinkShare'
import CopyField from '@/components/teacher/CopyField'
import { accountState, formatLongDate, formatRelative, isAbortError, studentDisplayName } from '@/components/teacher/format'
import { useMountedRef } from '@/components/teacher/hooks'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/students/AccountPanel.module.css'
import { Check, CircleAlert, KeyRound, Link2, LinkIcon } from 'lucide-react'
import Icon from '@/components/ui/Icon'

function ErrorAlert({ message }) {
  return (
    <div className={`${bits.alert} ${bits.error}`} role="alert">
      <span className={bits.alertIcon} aria-hidden="true">
        <Icon icon={CircleAlert} size={20} />
      </span>
      <span className={bits.alertBody}>{message}</span>
    </div>
  )
}

/**
 * Placeholder student (join link not used yet): no address, no sign-in link, but
 * « Nouveau lien d'invitation » (POST /api/teacher/students/[id]/join-link: the previous
 * links stop working, what was prepared still goes to the student when they join).
 */
function PlaceholderAccount({ student }) {
  const mounted = useMountedRef()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [result, setResult] = useState(null) // { link, message, joinLink }
  const [copied, setCopied] = useState(false)

  const createLink = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const res = await api(`/api/teacher/students/${student.id}/join-link`, { method: 'POST' })
      if (!mounted.current) return
      setResult(res)
      setCopied(await copyText(res.link))
    } catch (err) {
      if (!isAbortError(err) && mounted.current) setError(err.message || "Le lien n'a pas pu être créé.")
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <>
      <dl className={styles.facts}>
        <div>
          <dt>E-mail</dt>
          <dd>Pas encore : l&apos;élève choisit son adresse en rejoignant</dd>
        </div>
        <div>
          <dt>Statut</dt>
          <dd>Invitation en attente : l&apos;élève n&apos;a pas encore utilisé son lien d&apos;invitation.</dd>
        </div>
        {student.created_at && (
          <div>
            <dt>Fiche créée</dt>
            <dd>le {formatLongDate(student.created_at)}</dd>
          </div>
        )}
      </dl>

      <p className={styles.help}>
        Tu peux déjà importer ses leçons et créer ses exercices : tout passe sur son compte quand il rejoint. Lien
        perdu ou expiré ? Crée-en un nouveau (les précédents ne marcheront plus).
      </p>
      <button type="button" className={`${ui.btn} ${bits.blueGhost} ${styles.button}`} onClick={createLink} disabled={busy} aria-busy={busy || undefined}>
        {busy ? <span className={bits.spinner} aria-hidden="true" /> : <Icon icon={Link2} size={20} />}
        Nouveau lien d&apos;invitation
      </button>
      <p className="sr-only" role="status" aria-live="polite">
        {copied ? 'Lien copié dans le presse-papiers.' : ''}
      </p>

      {error && <ErrorAlert message={error} />}
      {result && (
        <div className={styles.result}>
          {copied && (
            <p className={styles.copied}>
              <Icon icon={Check} size={16} strokeWidth={3} className={styles.inlineIcon} /> Lien copié : colle-le dans le chat Preply, ou copie le message ci-dessous.
            </p>
          )}
          <CopyField
            label="Lien d'invitation"
            value={result.link}
            hint={`À usage unique, valable jusqu'au ${formatLongDate(result.joinLink?.expires_at)}.`}
          />
          {/* The student area is in English: so is the message */}
          <CopyField label="Message à coller dans le chat Preply" value={result.message} multiline lang="en" />
        </div>
      )}
    </>
  )
}

/**
 * « Compte » block of the student page: invitation / last sign-in, and a fresh
 * single-use sign-in link to send in the Preply chat (copied right away when the
 * browser allows it). A placeholder student gets a new invitation link instead.
 * @param {{ student: object }} props
 */
export default function AccountPanel({ student }) {
  if (student.placeholder) {
    return (
      <section id="compte" tabIndex={-1} className={`${ui.card} ${styles.panel}`} aria-labelledby="account-title">
        <h2 id="account-title" className={`${ui.sectionTitle} ${styles.title}`}>
          <Icon icon={KeyRound} size={22} /> Compte
        </h2>
        <PlaceholderAccount student={student} />
      </section>
    )
  }
  return <RealAccount student={student} />
}

function RealAccount({ student }) {
  const mounted = useMountedRef()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [link, setLink] = useState(null)
  const [copied, setCopied] = useState(false)
  const state = accountState(student)
  const name = studentDisplayName(student)

  const createLink = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    setCopied(false)
    try {
      const res = await api(`/api/teacher/students/${student.id}/sign-in-link`, { method: 'POST' })
      if (!mounted.current) return
      setLink(res.link)
      // May be refused outside the click's user activation (Safari): the copy buttons remain
      setCopied(await copyText(res.link))
    } catch (err) {
      if (!isAbortError(err) && mounted.current) setError(err.message || "Le lien n'a pas pu être créé.")
    } finally {
      if (mounted.current) setBusy(false)
    }
  }

  return (
    <section id="compte" tabIndex={-1} className={`${ui.card} ${styles.panel}`} aria-labelledby="account-title">
      <h2 id="account-title" className={`${ui.sectionTitle} ${styles.title}`}>
        <Icon icon={KeyRound} size={22} /> Compte
      </h2>

      <dl className={styles.facts}>
        <div>
          <dt>E-mail</dt>
          <dd>{student.email || '—'}</dd>
        </div>
        <div>
          <dt>Statut</dt>
          <dd>
            {state === 'invited'
              ? "Invitation en attente : l'élève ne s'est encore jamais connecté."
              : student.last_sign_in_at
                ? `Dernière connexion ${formatRelative(student.last_sign_in_at)}`
                : 'Compte actif'}
          </dd>
        </div>
        {student.created_at && (
          <div>
            <dt>Compte créé</dt>
            <dd>le {formatLongDate(student.created_at)}</dd>
          </div>
        )}
      </dl>

      <p className={styles.help}>
        L&apos;élève n&apos;arrive pas à se connecter ? Crée un lien de connexion à usage unique et envoie-le dans le
        chat Preply.
      </p>
      <button type="button" className={`${ui.btn} ${bits.blueGhost} ${styles.button}`} onClick={createLink} disabled={busy} aria-busy={busy || undefined}>
        {busy ? <span className={bits.spinner} aria-hidden="true" /> : <Icon icon={LinkIcon} size={20} />}
        {link ? 'Nouveau lien de connexion' : 'Copier un lien de connexion'}
      </button>
      <p className="sr-only" role="status" aria-live="polite">
        {copied ? 'Lien copié dans le presse-papiers.' : ''}
      </p>

      {error && <ErrorAlert message={error} />}
      {link && (
        <div className={styles.result}>
          {copied && (
            <p className={styles.copied}>
              <Icon icon={Check} size={16} strokeWidth={3} className={styles.inlineIcon} /> Lien copié : colle-le dans le chat Preply, ou copie le message ci-dessous.
            </p>
          )}
          <LinkShare kind={state === 'invited' ? 'invite' : 'signin'} name={name} email={student.email} link={link} />
        </div>
      )}
    </section>
  )
}
