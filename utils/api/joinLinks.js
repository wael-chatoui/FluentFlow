// Join links: one-time invitation links that need no email address (migration 0007).
//
// The teacher gives the student's first name: a placeholder student account is created
// right away (utils/api/placeholders.js), so lessons and exercises can be prepared before
// the student joins. The teacher pastes the link in the Preply chat. The student opens
// /join/<token>, signs in with Google or a magic link (account creation allowed: the
// account starts pending, like any self sign-up), then the page claims the link: the SQL
// function claim_join_link() moves everything the placeholder owns to the real account in
// one transaction, the account is approved and the placeholder deleted.
// Only the SHA-256 of the token is stored, so the table never holds a usable link.
import { createHash, randomBytes } from 'node:crypto'
import { HttpError } from '@/utils/api/errors'
import { approveUser } from '@/utils/api/invites'
import { getRole, isAdmin, isApproved } from '@/utils/auth/server'
import { createPlaceholderStudent, deletePlaceholder, isPlaceholder } from '@/utils/api/placeholders'

export const JOIN_LINK_TTL_DAYS = 14
export const JOIN_LABEL_MAX = 60
const DAY_MS = 24 * 60 * 60 * 1000
// 32 random bytes in base64url: 43 characters
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/

/** New random token (32 bytes, base64url). Goes in the URL only, never in the database. */
export function generateToken() {
  return randomBytes(32).toString('base64url')
}

/** Hex SHA-256 of a token: what the database stores and looks up. */
export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex')
}

/** True for a string shaped like a token from generateToken(). */
export const isTokenShaped = (token) => typeof token === 'string' && TOKEN_RE.test(token)

/** Public link to paste in the chat. */
export function joinUrl(origin, token) {
  return `${origin}/join/${token}`
}

/**
 * State of a join_links row at `now`.
 * @returns {'active'|'used'|'revoked'|'expired'}
 */
export function joinLinkStatus(link, now = Date.now()) {
  if (link?.used_at) return 'used'
  if (link?.revoked_at) return 'revoked'
  const expires = Date.parse(link?.expires_at || '')
  if (!Number.isFinite(expires) || expires <= now) return 'expired'
  return 'active'
}

const firstName = (label) => String(label || '').trim().split(/\s+/)[0] || ''

/**
 * Ready-to-paste message for the student (English, like the student area).
 * @param {{ label?: string|null, link: string, teacherName?: string }} params
 */
export function joinMessage({ label, link, teacherName = 'Wael' }) {
  const name = firstName(label)
  return [
    `Hi${name ? ` ${name}` : ''}!`,
    `Here is your personal link to join your French lessons space, where you'll find the recap and exercises after each class: ${link}`,
    `Open it, then sign in with Google or with your email address (a quick 3-step setup). The link works once and expires in ${JOIN_LINK_TTL_DAYS} days.`,
    `See you soon, ${teacherName}`,
  ].join('\n')
}

/** First name of the teacher, for the message (default 'Wael'). */
export async function teacherFirstName(admin, userId) {
  const { data } = await admin.from('profiles').select('full_name').eq('id', userId).maybeSingle()
  return (data?.full_name || '').trim().split(/\s+/)[0] || 'Wael'
}

/**
 * Creates a link for a placeholder student: a new one named `label`, or `studentId` (an
 * existing placeholder, e.g. « Nouveau lien d'invitation »). Returns the token (shown
 * once) with the stored row.
 * @param {{ label: string, studentId?: string|null, createdBy: string, origin: string, now?: number }} input
 * @returns {Promise<{ token: string, link: string, studentId: string,
 *   row: { id: string, label: string|null, student_id: string, expires_at: string } }>}
 */
export async function createJoinLink(admin, { label, studentId = null, createdBy, origin, now = Date.now() }) {
  const name = String(label || '').trim()
  if (!name) throw new HttpError(400, 'Indique le prénom de l’élève.')
  const created = studentId ? null : await createPlaceholderStudent(admin, name)
  const placeholderId = studentId || created.id

  const token = generateToken()
  const { data, error } = await admin
    .from('join_links')
    .insert({
      token_hash: hashToken(token),
      label: name,
      student_id: placeholderId,
      created_by: createdBy || null,
      expires_at: new Date(now + JOIN_LINK_TTL_DAYS * DAY_MS).toISOString(),
    })
    .select('id, label, student_id, created_at, expires_at')
    .single()
  if (error) {
    // Never leave an orphan placeholder made by this call
    if (created) await admin.auth.admin.deleteUser(created.id).catch(() => {})
    throw error
  }
  return { token, link: joinUrl(origin, token), studentId: placeholderId, row: data }
}

/** Revokes the unused links of a placeholder, but `exceptId`. Returns the revoked ids. */
export async function revokeLinksOf(admin, studentId, { exceptId = null, now = Date.now() } = {}) {
  let query = admin
    .from('join_links')
    .update({ revoked_at: new Date(now).toISOString() })
    .eq('student_id', studentId)
    .is('used_at', null)
    .is('revoked_at', null)
  if (exceptId) query = query.neq('id', exceptId)
  const { data, error } = await query.select('id')
  if (error) throw error
  return (data || []).map((r) => r.id)
}

/** The row for a token (any state), or null. */
export async function findJoinLink(admin, token) {
  if (!isTokenShaped(token)) return null
  const { data, error } = await admin
    .from('join_links')
    .select('id, label, student_id, created_by, created_at, expires_at, used_at, used_by, revoked_at')
    .eq('token_hash', hashToken(token))
    .maybeSingle()
  if (error) throw error
  return data || null
}

/**
 * The link when it can still be used (not used, not revoked, not expired).
 * @returns {Promise<{ link: object|null, reason?: 'unknown'|'used'|'expired'|'revoked' }>}
 */
export async function findUsableLink(admin, token, now = Date.now()) {
  const link = await findJoinLink(admin, token)
  if (!link) return { link: null, reason: 'unknown' }
  const status = joinLinkStatus(link, now)
  return status === 'active' ? { link } : { link: null, reason: status, row: link }
}

// Shown as-is by the join page (student side: English)
export const CLAIM_ERRORS = {
  unknown: 'This invitation link is not valid. Ask your teacher for a new one.',
  used: 'This invitation link has already been used. Ask your teacher for a new one.',
  expired: 'This invitation link has expired. Ask your teacher for a new one.',
  revoked: 'This invitation link was canceled by your teacher. Ask them for a new one.',
  not_student: 'You’re signed in with a teacher account. Invitation links are for students.',
}

const claimError = (reason) => new HttpError(reason === 'not_student' ? 409 : reason === 'unknown' ? 404 : 410, CLAIM_ERRORS[reason], reason)

/** Gives the student the label as a name when they have none yet (never fails the claim). */
async function nameFromLabel(admin, user, label) {
  const name = String(label || '').trim()
  if (!name) return
  try {
    const { data, error } = await admin.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    if (error) throw error
    if (data?.full_name?.trim()) return
    const { error: writeError } = data
      ? await admin.from('profiles').update({ full_name: name }).eq('id', user.id)
      : await admin.from('profiles').upsert({ id: user.id, email: user.email || null, full_name: name }, { onConflict: 'id' })
    if (writeError) throw writeError
  } catch (err) {
    console.error('[join-links] profile name:', err)
  }
}

/**
 * Spends the link for `user`: claim_join_link() moves what the placeholder owns to `user`
 * in one transaction (row lock: two browsers claiming the same link at once cannot both
 * win), then the account is approved (role stays student) and the placeholder deleted.
 * Idempotent for the user who already claimed it (a failed approval or deletion is
 * retried). Links without a placeholder (created before it) only approve and name the
 * account. Teachers, admins and placeholders are refused (409 not_student).
 * @param {import('@supabase/supabase-js').User} user  fresh from requireUser()
 * @returns {Promise<{ link: { id: string, label: string|null }, alreadyClaimed: boolean,
 *   placeholderId: string|null, lessons: number }>}
 */
export async function claimJoinLink(admin, token, user) {
  if (getRole(user) === 'teacher' || isAdmin(user) || isPlaceholder(user)) throw claimError('not_student')
  if (!isTokenShaped(token)) throw claimError('unknown')

  const { data, error } = await admin.rpc('claim_join_link', { p_token_hash: hashToken(token), p_user: user.id })
  if (error) throw error
  if (!data?.ok) throw claimError(CLAIM_ERRORS[data?.reason] ? data.reason : 'unknown')

  // The link is spent for this user: on failure, a retry by the same user ends the job
  if (!isApproved(user)) await approveUser(admin, user)
  const placeholderId = data.placeholder_id || null
  if (placeholderId) {
    try {
      await deletePlaceholder(admin, placeholderId)
    } catch (err) {
      // Empty by now: the teacher can delete it from the back office
      console.error('[join-links] placeholder delete:', err)
    }
  } else if (!data.already_claimed) {
    await nameFromLabel(admin, user, data.label)
  }
  return {
    link: { id: data.link_id, label: data.label || null },
    alreadyClaimed: Boolean(data.already_claimed),
    placeholderId,
    lessons: Number(data.lessons) || 0,
  }
}
