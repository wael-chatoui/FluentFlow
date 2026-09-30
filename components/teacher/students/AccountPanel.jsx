import { useState } from 'react'
import { api } from '@/utils/apiClient'
import { copyText } from '@/components/teacher/clipboard'
import LinkShare from '@/components/teacher/students/LinkShare'
import { accountState, formatLongDate, formatRelative, isAbortError, studentDisplayName } from '@/components/teacher/format'
import { useMountedRef } from '@/components/teacher/hooks'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/students/AccountPanel.module.css'
import { Check, CircleAlert, KeyRound, LinkIcon } from 'lucide-react'
import Icon from '@/components/ui/Icon'

/**
 * « Compte » block of the student page: invitation / last sign-in, and a fresh
 * single-use sign-in link to send in the Preply chat (copied right away when the
 * browser allows it).
 * @param {{ student: object }} props
 */
export default function AccountPanel({ student }) {
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

      {error && (
        <div className={`${bits.alert} ${bits.error}`} role="alert">
          <span className={bits.alertIcon} aria-hidden="true">
            <Icon icon={CircleAlert} size={20} />
          </span>
          <span className={bits.alertBody}>{error}</span>
        </div>
      )}
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
