// Placeholder students (migration 0007): created with a join link so the teacher can import
// lessons, create exercises and fill notes before the student joins. A real auth user
// (approved student, app_metadata.placeholder = true) with a fake address on the reserved
// .invalid domain and no email in its profile: it never signs in. When the student claims
// the link, claim_join_link() moves everything to the real account and the API deletes it.
import { randomBytes } from 'node:crypto'
import { isPlaceholder } from '@/utils/auth/server'

export { isPlaceholder }

export const PLACEHOLDER_DOMAIN = 'placeholder.invalid'
const PLACEHOLDER_EMAIL_RE = /^invite-[0-9a-f]{24}@placeholder\.invalid$/

/** Fake, unique address of a new placeholder: invite-<24 hex>@placeholder.invalid. */
export function placeholderEmail() {
  return `invite-${randomBytes(12).toString('hex')}@${PLACEHOLDER_DOMAIN}`
}

/** True for an address on the placeholder domain (never a real student's). */
export function isPlaceholderEmail(email) {
  return String(email || '').trim().toLowerCase().endsWith(`@${PLACEHOLDER_DOMAIN}`)
}

/** True for an address made by placeholderEmail() (strict shape). */
export const isPlaceholderEmailShaped = (email) => PLACEHOLDER_EMAIL_RE.test(String(email || ''))

/**
 * Creates the placeholder student for a join link. Its profile carries the name and no
 * email (the fake address is never shown).
 * @returns {Promise<import('@supabase/supabase-js').User>}
 */
export async function createPlaceholderStudent(admin, fullName) {
  const name = String(fullName || '').trim()
  const { data, error } = await admin.auth.admin.createUser({
    email: placeholderEmail(),
    email_confirm: true,
    app_metadata: { role: 'student', approved: true, placeholder: true },
    user_metadata: name ? { full_name: name } : {},
  })
  if (error) throw error
  const user = data?.user
  if (!user?.id) throw new Error('createUser returned no user')

  // The DB trigger made the profile with the fake address: replace it with the name only
  const { error: profileError } = await admin
    .from('profiles')
    .upsert({ id: user.id, email: null, full_name: name || null }, { onConflict: 'id' })
  if (profileError) {
    await admin.auth.admin.deleteUser(user.id).catch(() => {})
    throw profileError
  }
  return user
}

/**
 * Deletes a placeholder auth user (its leftovers cascade). Checks the flag first: never
 * deletes a real account. Returns true when it was deleted (or was already gone).
 */
export async function deletePlaceholder(admin, id) {
  if (!id) return false
  const { data, error } = await admin.auth.admin.getUserById(id)
  if (error) {
    if (error.status === 404 || /not.?found/i.test(error.message || '')) return true
    throw error
  }
  if (!isPlaceholder(data?.user)) return false
  const { error: deleteError } = await admin.auth.admin.deleteUser(id)
  if (deleteError) throw deleteError
  return true
}
