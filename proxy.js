// Next.js 16 Proxy (formerly Middleware): refreshes the Supabase session cookie
// and does optimistic redirects. Real authorization happens in each API route
// (utils/auth/server.js) — this only keeps people on the right pages.
//
// Back office: requests on a back-office host (BACKOFFICE_HOSTS, e.g.
// backoffice.lurl.com) are kept inside /admin; /admin requires app_metadata.is_admin.
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'

const BACKOFFICE_HOSTS = (process.env.BACKOFFICE_HOSTS || 'backoffice.lurl.com,backoffice.localhost')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean)

// Paths that work the same on every host (auth flow, public admin error page)
const SHARED_PATHS = ['/login', '/auth/callback', '/admin/forbidden']

function isBackofficeHost(req) {
  const host = (req.headers.get('host') || '').split(':')[0].toLowerCase()
  return BACKOFFICE_HOSTS.includes(host)
}

function isShared(pathname) {
  return SHARED_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function needsAuth(pathname) {
  return ['/student', '/teacher', '/onboarding', '/admin'].some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

function redirectTo(req, pathname, response) {
  const redirect = NextResponse.redirect(new URL(pathname, req.url))
  // Keep any refreshed auth cookies on the redirect response
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  return redirect
}

export async function proxy(req) {
  const { pathname } = req.nextUrl
  const backoffice = isBackofficeHost(req)

  // On the back-office host everything lives under /admin
  if (backoffice && !isShared(pathname) && !pathname.startsWith('/admin')) {
    return NextResponse.redirect(new URL('/admin', req.url))
  }
  if (isShared(pathname) || !needsAuth(pathname)) return NextResponse.next()

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

  if (pathname.startsWith('/admin')) {
    return user.app_metadata?.is_admin === true ? response : redirectTo(req, '/admin/forbidden', response)
  }

  const isTeacher = user.app_metadata?.role === 'teacher'
  if (pathname.startsWith('/teacher') && !isTeacher) return redirectTo(req, '/student', response)
  if ((pathname.startsWith('/student') || pathname.startsWith('/onboarding')) && isTeacher) {
    return redirectTo(req, '/teacher', response)
  }

  return response
}

export const config = {
  // Everything except Next internals, API routes and static files
  matcher: ['/((?!_next/|api/|favicon\\.ico|.*\\.[a-zA-Z0-9]+$).*)'],
}
