// Browser-side Supabase client (singleton pattern via createBrowserClient)
import { createBrowserClient } from '@supabase/ssr'

/**
 * Returns null while rendering on the server: there is no browser session there,
 * and the NEXT_PUBLIC_* env vars may be missing at build time (static prerender).
 * Callers only use the client in effects/handlers, which run in the browser.
 */
export function createClient() {
  if (typeof window === 'undefined') return null
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}
