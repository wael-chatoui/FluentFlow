// Join links: one-time invitation links that need no email address (migration 0007).
//
// The teacher creates a link (optional first name as a label) and pastes it in the
// Preply chat. The student opens /join/<token>, signs in with Google or a magic link
// (account creation allowed: the account starts pending, like any self sign-up), then
// the page claims the link: the account is approved and the link is spent.
// Only the SHA-256 of the token is stored, so the table never holds a usable link.
import { createHash, randomBytes } from 'node:crypto'
import { HttpError } from '@/utils/api/errors'
import { approveUser } from '@/utils/api/invites'
import { getRole, isAdmin, isApproved } from '@/utils/auth/server'

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

/**
 * Creates a link. Returns the token (shown once) with the stored row.
 * @param {{ label?: string|null, createdBy: string, origin: string, now?: number }} input
 * @returns {Promise<{ token: string, link: string, row: { id: string, label: string|null, expires_at: string } }>}
 */
export async function createJoinLink(admin, { label = null, createdBy, origin, now = Date.now() }) {
  const token = generateToken()
  const { data, error } = await admin
    .from('join_links')
    .insert({
      token_hash: hashToken(token),
      label: label || null,
      created_by: createdBy || null,
      expires_at: new Date(now + JOIN_LINK_TTL_DAYS * DAY_MS).toISOString(),
    })
    .select('id, label, created_at, expires_at')
    .single()
  if (error) throw error
  return { token, link: joinUrl(origin, token), row: data }
}

/** The row for a token (any state), or null. */
export async function findJoinLink(admin, token) {
  if (!isTokenShaped(token)) return null
  const { data, error } = await admin
    .from('join_links')
    .select('id, label, created_by, created_at, expires_at, used_at, used_by, revoked_at')
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
 * Spends the link for `user` and approves the account (role stays student).
 * Atomic: two browsers claiming the same link at once cannot both win. Idempotent for
 * the user who already claimed it. Teachers and admins are refused (409 not_student).
 * @param {import('@supabase/supabase-js').User} user  fresh from requireUser()
 * @returns {Promise<{ link: object, alreadyClaimed: boolean }>}
 */
export async function claimJoinLink(admin, token, user, now = Date.now()) {
  if (getRole(user) === 'teacher' || isAdmin(user)) throw claimError('not_student')
  const link = await findJoinLink(admin, token)
  if (!link) throw claimError('unknown')

  const approve = async () => {
    if (!isApproved(user)) await approveUser(admin, user)
  }

  // Same user again (reload, second tab): make sure the account is approved, nothing else
  if (link.used_by && link.used_by === user.id) {
    await approve()
    return { link, alreadyClaimed: true }
  }

  const status = joinLinkStatus(link, now)
  if (status !== 'active') throw claimError(status)

  const usedAt = new Date(now).toISOString()
  const { data: claimed, error } = await admin
    .from('join_links')
    .update({ used_at: usedAt, used_by: user.id })
    .eq('id', link.id)
    .is('used_at', null)
    .is('revoked_at', null)
    .gt('expires_at', usedAt)
    .select('id')
  if (error) throw error
  if (!claimed?.length) {
    // Lost a race (or revoked meanwhile): tell which
    const fresh = await findJoinLink(admin, token)
    if (fresh?.used_by === user.id) {
      await approve()
      return { link: fresh, alreadyClaimed: true }
    }
    if (!fresh) throw claimError('unknown')
    const freshStatus = joinLinkStatus(fresh, now)
    throw claimError(freshStatus === 'active' ? 'used' : freshStatus)
  }

  try {
    await approve()
  } catch (err) {
    // Give the link back: the student can try again
    await admin
      .from('join_links')
      .update({ used_at: null, used_by: null })
      .eq('id', link.id)
      .eq('used_by', user.id)
      .then(() => {}, () => {})
    throw err
  }
  await nameFromLabel(admin, user, link.label)
  return { link: { ...link, used_at: usedAt, used_by: user.id }, alreadyClaimed: false }
}
