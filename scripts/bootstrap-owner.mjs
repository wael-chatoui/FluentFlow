// Makes an account the teacher (and back-office admin) — replaces hand-editing
// supabase/migrations/0002_set_teacher.sql and 0004_backoffice.sql.
//
//   node --env-file=.env.local scripts/bootstrap-owner.mjs you@example.com [--no-admin]
//
// The account must exist (sign in once with Google, or it is created here and you
// get a one-time sign-in link). Needs NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
import { createClient } from '@supabase/supabase-js'

const [email, flag] = process.argv.slice(2)
if (!email || !email.includes('@')) {
  console.error('Usage: node --env-file=.env.local scripts/bootstrap-owner.mjs you@example.com [--no-admin]')
  process.exit(1)
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.')
  process.exit(1)
}
const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
const site = (process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000').replace(/\/+$/, '')

async function findUser(address) {
  for (let page = 1; page <= 50; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw error
    const found = data.users.find((u) => u.email?.toLowerCase() === address.toLowerCase())
    if (found || data.users.length < 1000) return found || null
  }
  return null
}

let user = await findUser(email)
let link = null
if (!user) {
  const { data, error } = await admin.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo: `${site}/auth/confirm` } })
  if (error) throw error
  user = data.user
  link = `${site}/auth/confirm?token_hash=${encodeURIComponent(data.properties.hashed_token)}&type=invite`
}

const appMetadata = { ...(user.app_metadata || {}), role: 'teacher', approved: true, is_admin: flag !== '--no-admin' }
const { error } = await admin.auth.admin.updateUserById(user.id, { app_metadata: appMetadata })
if (error) throw error
await admin.from('profiles').upsert({ id: user.id, email: user.email }, { onConflict: 'id', ignoreDuplicates: true })

console.log(`✓ ${email} is now teacher${appMetadata.is_admin ? ' + admin' : ''}. Sign out and back in to refresh the session.`)
if (link) console.log(`One-time sign-in link: ${link}`)
