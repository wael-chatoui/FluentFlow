import CopyField from '@/components/teacher/CopyField'
import styles from '@/components/teacher/students/LinkShare.module.css'

function firstName(name) {
  return (name || '').trim().split(/\s+/)[0] || ''
}

/**
 * Message for the student (English, like the student area), to paste in the Preply chat.
 * @param {{ kind: 'invite'|'signin', name?: string, email: string, link: string|null }} params
 *   link null = an invitation email was sent by the app instead.
 */
export function shareMessage({ kind, name, email, link }) {
  const hello = `Hi${firstName(name) ? ` ${firstName(name)}` : ''}! 👋`
  if (kind === 'signin') {
    return `${hello}\nHere is a new link to sign in to your lesson space: ${link}\nIt works only once. Next time you can sign in with Google or ask for a sign-in link sent to ${email}.`
  }
  if (!link) {
    return `${hello}\nI've just sent you an invitation to your lesson space (lesson recaps + exercises after each class). Check your inbox at ${email} (and the spam folder, just in case).`
  }
  return `${hello}\nHere is your personal link to your lesson space, where you'll find the recap and exercises after each class: ${link}\nIt works only once. Next time, sign in with Google or ask for a sign-in link sent to ${email}.`
}

/**
 * Single-use link + ready-to-paste message, each with a « Copier » button.
 * @param {{ kind: 'invite'|'signin', name?: string, email: string, link: string|null }} props
 */
export default function LinkShare({ kind, name, email, link }) {
  return (
    <div className={styles.share}>
      {link && (
        <CopyField
          label={kind === 'signin' ? 'Lien de connexion' : "Lien d'accès"}
          value={link}
          hint="Personnel et à usage unique : envoie-le seulement à cet élève."
        />
      )}
      {/* The student area is in English: so is the message (read with an English voice) */}
      <CopyField
        label="Message à coller dans le chat Preply"
        value={shareMessage({ kind, name, email, link })}
        multiline
        lang="en"
      />
    </div>
  )
}
