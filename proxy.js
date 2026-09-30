// Next.js 16 Proxy (formerly Middleware): refreshes the Supabase session cookie
// and does optimistic redirects. Real authorization happens in each API route
// (utils/auth/server.js) — this only keeps people on the right pages.
//
// Back office: requests on a back-office host (BACKOFFICE_HOSTS, e.g.
// backoffice.example.com) are kept inside /admin; /admin requires app_metadata.is_admin.
// Invite-only access: accounts waiting for the teacher's approval only see /pending.
// Sign-in links: a browser a link signed in answers "Is this your account?" on
// /auth/confirm before any app page (utils/auth/linkConfirm.js).
import { NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { createAdminClient } from '@/utils/supabase/admin'
import { getRole, isAdmin, isApproved, isBanned } from '@/utils/auth/server'
import { LINK_CONFIRM_COOKIE } from '@/utils/auth/linkConfirm'
import { inArea } from '@/utils/auth/routing'

const BACKOFFICE_HOSTS = (process.env.BACKOFFICE_HOSTS || 'backoffice.localhost')
  .split(',')
  .map((h) => h.trim().toLowerCase())
  .filter(Boolean)

// Paths that work the same on every host (auth flow, public admin error page)
// /join/<token>: public invitation page (join links), signed in or not
const SHARED_PATHS = ['/login', '/logout', '/auth/callback', '/auth/confirm', '/pending', '/join', '/admin/forbidden']
const PROTECTED_AREAS = ['/student', '/teacher', '/onboarding', '/admin', '/pending']

// Remembers (per user) that onboarding is done, so the profile is read once, not on
// every page. Not a security boundary: it only spares a database round trip.
const ONBOARDED_COOKIE = 'pl-onboarded'
const ONBOARDED_MAX_AGE = 60 * 60 * 24 * 30

// Supabase Auth unreachable or failing: the session may be fine. Sending the user to
// /login would bounce back here (the browser still has its session) in a loop.
const isAuthOutage = (error) => error?.name === 'AuthRetryableFetchError' || Number(error?.status) >= 500

function isBackofficeHost(req) {
  const host = (req.headers.get('host') || '').split(':')[0].toLowerCase()
  return BACKOFFICE_HOSTS.includes(host)
}

const isShared = (pathname) => SHARED_PATHS.some((p) => inArea(pathname, p))
const needsAuth = (pathname) => pathname !== '/admin/forbidden' && PROTECTED_AREAS.some((p) => inArea(pathname, p))

function redirectTo(req, target, response) {
  const redirect = NextResponse.redirect(new URL(target, req.url))
  // Keep any refreshed auth cookies on the redirect response
  response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
  return redirect
}

// <base>?next=<the page asked for>, so the user comes back to it afterwards
function withNext(req, base) {
  const params = new URLSearchParams(req.nextUrl.search)
  for (const key of [...params.keys()]) if (key.startsWith('__next')) params.delete(key)
  const query = params.toString()
  const target = `${req.nextUrl.pathname}${query ? `?${query}` : ''}`
  return target.length > 512 ? base : `${base}?next=${encodeURIComponent(target)}`
}

async function isOnboarded(req, response, userId) {
  if (req.cookies.get(ONBOARDED_COOKIE)?.value === userId) return true
  try {
    const { data, error } = await createAdminClient()
      .from('profiles')
      .select('onboarded_at')
      .eq('id', userId)
      .maybeSingle()
    if (error) throw error
    if (!data?.onboarded_at) return false
    response.cookies.set(ONBOARDED_COOKIE, userId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: ONBOARDED_MAX_AGE,
    })
    return true
  } catch (err) {
    // Never lock a student out because of a database hiccup: the pages re-check anyway
    console.error('[proxy] onboarding check failed:', err)
    return true
  }
}

export async function proxy(req) {
  const { pathname } = req.nextUrl
  const backoffice = isBackofficeHost(req)

  // On the back-office host everything lives under /admin
  if (backoffice && !isShared(pathname) && !inArea(pathname, '/admin')) {
    return NextResponse.redirect(new URL('/admin', req.url))
  }
  if (!needsAuth(pathname)) return NextResponse.next()

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

  // getUser() (not getSession/getClaims): fresh role, approval and ban state from Supabase Auth
  let user = null
  try {
    const { data, error } = await supabase.auth.getUser()
    if (!data?.user && isAuthOutage(error)) {
      // Let the page load: its API calls answer 503 and it shows a retry
      console.error('[proxy] getUser failed:', error)
      return response
    }
    user = data?.user ?? null
  } catch (err) {
    console.error('[proxy] getUser threw:', err)
    return response
  }
  if (!user) {
    // Nothing to wait for on /pending without an account
    return redirectTo(req, pathname === '/pending' ? '/login' : withNext(req, '/login'), response)
  }
  // Suspended in the back office: /login explains it and signs the browser out
  if (isBanned(user)) return redirectTo(req, '/login', response)
  // Signed in by a link and not confirmed yet: whose account is it?
  if (req.cookies.get(LINK_CONFIRM_COOKIE)?.value === user.id) {
    return redirectTo(req, withNext(req, '/auth/confirm'), response)
  }

  const isTeacher = getRole(user) === 'teacher'
  const pending = !isApproved(user)

  if (pathname === '/pending') return pending ? response : redirectTo(req, '/', response)
  // Before the admin check: the admin API refuses accounts waiting for approval too
  if (pending) return redirectTo(req, '/pending', response)

  if (inArea(pathname, '/admin')) {
    return isAdmin(user) ? response : redirectTo(req, '/admin/forbidden', response)
  }

  if (inArea(pathname, '/teacher') && !isTeacher) return redirectTo(req, '/student', response)
  if ((inArea(pathname, '/student') || inArea(pathname, '/onboarding')) && isTeacher) {
    return redirectTo(req, '/teacher', response)
  }

  // Every student page needs a finished onboarding (not only the home page)
  if (inArea(pathname, '/student') && !(await isOnboarded(req, response, user.id))) {
    return redirectTo(req, '/onboarding', response)
  }

  return response
}

export const config = {
  // Everything except Next internals, API routes, static files and the sign-in landings
  // (/auth/*: nothing to check there, and a matching proxy makes Next.js put the original
  // URL, one-time tokens included, back in the address bar after hydration)
  matcher: ['/((?!_next/|api/|auth/|favicon\\.ico|.*\\.[a-zA-Z0-9]+$).*)'],
}
