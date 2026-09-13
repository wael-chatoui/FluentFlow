import { NextResponse } from 'next/server'
import { createServerClient, parseCookieHeader, serializeCookieHeader } from '@supabase/ssr'

export async function proxy(req) {
  const res = NextResponse.next()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(req.headers.get('cookie') ?? '')
        },
        setAll(cookiesToSet, headers) {
          // Update request cookies for downstream server components
          cookiesToSet.forEach(({ name, value }) => {
            req.cookies.set(name, value)
          })
          // Update response cookies for the browser
          cookiesToSet.forEach(({ name, value, options }) => {
            res.headers.append(
              'Set-Cookie',
              serializeCookieHeader(name, value, options)
            )
          })
          // Apply cache headers
          if (headers) {
            Object.entries(headers).forEach(([key, value]) => {
              res.headers.set(key, value)
            })
          }
        },
      },
    }
  )

  // Refresh the auth token
  const { data: { user }, error } = await supabase.auth.getUser()

  // If not authenticated, redirect to login
  if (error || !user) {
    const loginUrl = new URL('/login', req.url)
    return NextResponse.redirect(loginUrl)
  }

  const role = user.user_metadata?.role

  // Role-based access control
  const pathname = req.nextUrl.pathname

  if (pathname.startsWith('/teacher') && role !== 'teacher') {
    // Non-teachers trying to access teacher area
    return NextResponse.redirect(new URL('/student', req.url))
  }

  if (pathname.startsWith('/student') && role === 'teacher') {
    // Teachers accessing student area — redirect to teacher dashboard
    return NextResponse.redirect(new URL('/teacher', req.url))
  }

  return res
}

export const config = {
  matcher: ['/student/:path*', '/teacher/:path*'],
}
