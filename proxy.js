// Next.js 16 Proxy (formerly Middleware): refreshes the Supabase session cookie
// and does optimistic role-based redirects. Real authorization happens in each
// API route (utils/auth/server.js) — this only keeps people on the right pages.
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

function redirectTo(req, pathname, response) {
  const redirect = NextResponse.redirect(new URL(pathname, req.url))
  // Keep any refreshed auth cookies on the redirect response
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  return redirect
}

export async function proxy(req) {
  let response = NextResponse.next({ request: req })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return req.cookies.getAll()
        },
        setAll(cookiesToSet, headers) {
          cookiesToSet.forEach(({ name, value }) => req.cookies.set(name, value))
          response = NextResponse.next({ request: req })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          if (headers) {
            Object.entries(headers).forEach(([key, value]) => response.headers.set(key, value))
          }
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return redirectTo(req, '/login', response)

  const isTeacher = user.app_metadata?.role === 'teacher'
  const { pathname } = req.nextUrl

  if (pathname.startsWith('/teacher') && !isTeacher) return redirectTo(req, '/student', response)
  if ((pathname.startsWith('/student') || pathname.startsWith('/onboarding')) && isTeacher) {
    return redirectTo(req, '/teacher', response)
  }

  return response
}

export const config = {
  matcher: ['/student/:path*', '/teacher/:path*', '/onboarding'],
}
