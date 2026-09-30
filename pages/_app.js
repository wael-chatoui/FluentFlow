import '@/styles/globals.css'
import '@/styles/print.css'
import '@/styles/tokens.css'
import { useEffect, useLayoutEffect } from 'react'
import AuthProvider from '@/components/AuthProvider'
import { appFont } from '@/components/ui/font'
import { markAppStarted } from '@/utils/auth/appNavigation'
import { pageLang } from '@/utils/auth/routing'

// Passive effects run child-first: in a useEffect here, <html lang> would change after the
// new page's own effects (its first api() calls and LoadingScreen would still read the
// previous page's language). Layout effects all run before any passive effect.
// (useLayoutEffect does nothing on the server, where React 18 warns about it.)
const useBeforePageEffects = typeof window === 'undefined' ? useEffect : useLayoutEffect

function MyApp({ Component, pageProps, router }) {
  // pages/_document.js sets <html lang> on the first load only: follow client-side navigations.
  // /logout keeps the language of the page it was opened from (and may switch it itself).
  const pathname = router.pathname
  useBeforePageEffects(() => {
    if (pathname === '/logout') return
    document.documentElement.lang = pageLang(pathname)
  }, [pathname])

  // Runs after the first page's own effects: every page mounted from now on was reached
  // by a client-side navigation, i.e. from the app itself (see pages/logout.js)
  useEffect(() => {
    markAppStarted()
  }, [])

  return (
    <AuthProvider>
      <style jsx global>{`
        :root {
          --font-app: ${appFont.style.fontFamily};
        }
        html body {
          font-family: var(--font-app);
        }
      `}</style>
      <Component {...pageProps} />
    </AuthProvider>
  )
}

export default MyApp
