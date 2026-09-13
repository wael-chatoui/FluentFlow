// Server-side Supabase client for API routes (Pages Router)
// Creates a per-request client that can read/write auth cookies
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'

/**
 * Create a Supabase server client for Next.js API routes (Pages Router).
 * @param {{ req: import('next').NextApiRequest, res: import('next').NextApiResponse }} context
 */
export function createClient({ req, res }) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(req.headers.cookie ?? '')
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value, options }) => {
            res.appendHeader(
              'Set-Cookie',
              serializeCookieHeader(name, value, options)
            )
          })
          // Apply cache headers to prevent CDNs from caching authenticated responses
          if (headers) {
            Object.entries(headers).forEach(([key, value]) => {
              res.setHeader(key, value)
            })
          }
        },
      },
    }
  )
}
