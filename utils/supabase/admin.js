// Admin Supabase client using the Service Role Key
// Use ONLY on the server for privileged operations (creating users, listing all users, etc.)
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

let adminClient = null

export function createAdminClient() {
  if (adminClient) return adminClient

  adminClient = createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )

  return adminClient
}
