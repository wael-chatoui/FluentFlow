// Invitations and one-time sign-in links (invite-only access).
//
// Links point to /auth/confirm?token_hash=…&type=… on the main app, which calls
// supabase.auth.verifyOtp(). This works on any device and does not depend on the
// Supabase email templates or on PKCE. The teacher can copy a link and send it
// through the Preply chat, or let Supabase email it (sendEmail).
import { HttpError, fail } from '@/utils/api/errors'
import { findAuthUserByEmail } from '@/utils/api/students'

const HOST_RE = /^[a-z0-9.-]+(:\d{1,5})?$/i
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function backofficeHosts() {
  return (process.env.BACKOFFICE_HOSTS || 'backoffice.localhost')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean)
}

const isLocalHost = (host) => /^(localhost|127\.0\.0\.1|\[::1\]|[^:]+\.localhost)(:\d+)?$/i.test(host)

/**
 * Public origin of the main app, for links given to students. NEXT_PUBLIC_SITE_URL
 * wins when set (required when the request comes from the back-office host, so
 * students never land inside /admin); otherwise the request's own origin.
 */
export function appOrigin(req) {
  const first = (v) => String(Array.isArray(v) ? v[0] : v || '').split(',')[0].trim()
  const host = first(req.headers?.['x-forwarded-host']) || first(req.headers?.host)
  const site = (process.env.NEXT_PUBLIC_SITE_URL || '').trim().replace(/\/+$/, '')
  const bareHost = host.toLowerCase().replace(/:\d+$/, '')
  const onBackoffice = backofficeHosts().includes(bareHost)

  // A localhost site URL copied to production would send students to their own machine
  const usableSite = site && !(process.env.NODE_ENV === 'production' && /\/\/(localhost|127\.0\.0\.1)/.test(site))
  if (usableSite && (onBackoffice || !host)) return site
  if (onBackoffice) {
    if (isLocalHost(host)) return `http://localhost${host.match(/:\d+$/)?.[0] || ''}`
    throw new HttpError(500, 'NEXT_PUBLIC_SITE_URL doit être configurée (URL publique de l’app élève) pour créer des liens depuis le back office.')
  }
  if (!host || !HOST_RE.test(host)) return site || 'http://localhost:3000'
  const forwarded = first(req.headers?.['x-forwarded-proto']).toLowerCase()
  const proto = forwarded === 'http' || forwarded === 'https' ? forwarded : isLocalHost(host) ? 'http' : 'https'
  return `${proto}://${host}`
}

/** Link to the confirm page for a hashed token returned by auth.admin.generateLink(). */
export function confirmLink(origin, hashedToken, type) {
  return `${origin}/auth/confirm?token_hash=${encodeURIComponent(hashedToken)}&type=${encodeURIComponent(type)}`
}

/** Lower-cased, validated email (French message). */
export function parseEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : ''
  if (!email || email.length > 254 || !EMAIL_RE.test(email)) fail('Adresse e-mail invalide.')
  return email
}

const alreadyExists = (error) =>
  error?.code === 'email_exists' || /already (been )?registered|already exists/i.test(error?.message || '')

const rateLimited = (error) => error?.status === 429 || /rate limit/i.test(error?.code || error?.message || '')

const emailExists = () => new HttpError(409, 'Un compte existe déjà avec cette adresse e-mail.', 'email_exists')

/** Maps a Supabase Auth admin error to a French HttpError when it is a known case. */
function authError(error) {
  if (alreadyExists(error)) return emailExists()
  if (rateLimited(error)) {
    return new HttpError(429, 'Trop d’e-mails envoyés pour le moment. Réessaie plus tard ou utilise le lien à copier.', 'rate_limited')
  }
  if (error?.code === 'validation_failed' || /invalid.*email|email.*invalid/i.test(error?.message || '')) {
    return new HttpError(400, 'Adresse e-mail invalide.')
  }
  return error
}

// Clock difference tolerated between this server and Supabase Auth
const CLOCK_SKEW_MS = 2 * 60 * 1000

/**
 * True when the user returned by an invitation was created by that call. Supabase Auth
 * refuses an invitation only for a CONFIRMED address: for an existing account whose
 * email is not confirmed yet (an invitation never opened) it returns that account
 * and issues a new token. Such an account already went through inviteUser (approved,
 * a role…) or is older than the call.
 * @param {number} startedAt  Date.now() taken before the invitation call
 */
export function isFreshInvite(user, startedAt) {
  const meta = user?.app_metadata || {}
  if (meta.approved === true || meta.role === 'teacher' || meta.is_admin === true) return false
  const created = Date.parse(user?.created_at || '')
  return !Number.isFinite(created) || created >= startedAt - CLOCK_SKEW_MS
}

/**
 * Creates an approved account for `email` and returns a link to sign in with.
 * sendEmail: Supabase emails the invitation (link: null); otherwise nothing is sent
 * and the returned link is to be shared by the teacher.
 * Any existing account, confirmed or not, is refused with 409 `email_exists` and left
 * untouched (its role, admin flag and pending link): use createSignInLink for it.
 * @param {{ email: string, fullName?: string, role?: 'student'|'teacher', isAdmin?: boolean,
 *           sendEmail?: boolean, origin: string }} input
 * @returns {Promise<{ user: import('@supabase/supabase-js').User, link: string|null }>}
 */
export async function inviteUser(admin, { email, fullName = '', role = 'student', isAdmin = false, sendEmail = false, origin }) {
  const redirectTo = `${origin}/auth/confirm`
  const data = fullName ? { full_name: fullName } : {}

  // Checked first: inviting an unconfirmed address would replace its pending link
  const startedAt = Date.now()
  if (await findAuthUserByEmail(admin, email)) throw emailExists()

  let invited
  let link = null
  if (sendEmail) {
    const { data: res, error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data })
    if (error) throw authError(error)
    invited = res?.user
  } else {
    const { data: res, error } = await admin.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo, data } })
    if (error) throw authError(error)
    invited = res?.user
    link = confirmLink(origin, res.properties.hashed_token, 'invite')
  }
  if (!invited?.id) throw new Error('invite returned no user')
  // Created by someone else since the check: never change (or delete) that account
  if (!isFreshInvite(invited, startedAt)) throw emailExists()

  // Role, admin flag and approval live in app_metadata (users cannot edit it)
  const appMetadata = { ...(invited.app_metadata || {}), role, approved: true, is_admin: isAdmin }
  const { data: updated, error: updateError } = await admin.auth.admin.updateUserById(invited.id, { app_metadata: appMetadata })
  if (updateError) {
    // Never leave an account with the wrong role / approval behind (it was created just above)
    await admin.auth.admin.deleteUser(invited.id).catch(() => {})
    throw updateError
  }

  // The DB trigger creates the profile; make sure it exists and carries the name
  const { error: profileError } = await admin
    .from('profiles')
    .upsert({ id: invited.id, email, ...(fullName ? { full_name: fullName } : {}) }, { onConflict: 'id' })
  if (profileError) console.error('[invites] profile upsert:', profileError)

  return { user: updated?.user || { ...invited, app_metadata: appMetadata }, link }
}

/**
 * One-time sign-in link for an existing account (e.g. a student who lost access,
 * or an invitation that expired). Nothing is emailed.
 */
export async function createSignInLink(admin, email, origin) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
    options: { redirectTo: `${origin}/auth/confirm` },
  })
  if (error) throw authError(error)
  return confirmLink(origin, data.properties.hashed_token, 'magiclink')
}

/** Approves a pending account (self sign-up). */
export async function approveUser(admin, user) {
  const { data, error } = await admin.auth.admin.updateUserById(user.id, {
    app_metadata: { ...(user.app_metadata || {}), approved: true },
  })
  if (error) throw error
  return data?.user
}
