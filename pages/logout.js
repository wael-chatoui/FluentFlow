import { useEffect, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { useAuth } from '@/components/AuthProvider'
import AuthScreen, { AuthHeader } from '@/components/auth/AuthScreen'
import LoadingScreen from '@/components/ui/LoadingScreen'
import { reachedFromApp } from '@/utils/auth/appNavigation'
import { pageLang, safeNext } from '@/utils/auth/routing'
import ui from '@/components/ui/ui.module.css'
import form from '@/components/auth/AuthForm.module.css'

const TEXT = {
  en: {
    title: 'Signing out · Preply Lessons',
    label: 'Signing out…',
    ask: 'Sign out?',
    signedInAs: 'You’re signed in as',
    everywhere: 'Signing out ends your session on all your devices.',
    confirm: 'Sign out',
    cancel: 'Cancel',
  },
  fr: {
    title: 'Déconnexion · Preply Lessons',
    label: 'Déconnexion…',
    ask: 'Se déconnecter ?',
    signedInAs: 'Connecté en tant que',
    everywhere: 'La déconnexion ferme ta session sur tous tes appareils.',
    confirm: 'Se déconnecter',
    cancel: 'Annuler',
  },
}

/** 'fr' when the URL says the user leaves the teacher area or the back office, else null. */
function langFromQuery(query) {
  const from = Array.isArray(query.from) ? query.from[0] : query.from
  if (from === 'teacher' || from === 'admin') return 'fr'
  const next = safeNext(query.next)
  return next && pageLang(next) === 'fr' ? 'fr' : null
}

/**
 * /logout: signs out (every device, see AuthProvider) and goes to /login.
 * A plain link that works on every host, including the back office for accounts
 * that cannot reach any in-app sign-out button. ?next= is handed to /login.
 *
 * The app's own links reach it with a client-side navigation and sign out at once.
 * A page load of /logout may come from any site (a link, a redirect, a hidden
 * popup): it only signs out after a click, so no other site can end the user's
 * sessions. Never inside a frame (the click could be hijacked).
 *
 * Speaks the language of the page it was opened from: a client-side jump keeps
 * that page's <html lang> (pages/_app.js leaves it alone here); a full page load
 * falls back to ?from=teacher|admin or a ?next= inside those areas.
 */
export default function LogoutPage() {
  const router = useRouter()
  const routerRef = useRef(router)
  routerRef.current = router
  const { user, loading, signOut } = useAuth()
  const startedRef = useRef(false)
  const [lang, setLang] = useState(null) // decided once, when the query is known
  const [fromApp] = useState(reachedFromApp) // at the first render, see utils/auth/appNavigation.js
  const [confirmed, setConfirmed] = useState(false)
  const [framed, setFramed] = useState(false)

  useEffect(() => {
    if (!router.isReady || lang) return
    // <html lang> is still the previous page's after a client-side jump ('en' on a full load)
    setLang(langFromQuery(router.query) || (document.documentElement.lang === 'fr' ? 'fr' : 'en'))
  }, [router.isReady, router.query, lang])

  useEffect(() => {
    if (lang) document.documentElement.lang = lang
  }, [lang])

  useEffect(() => {
    setFramed(window.self !== window.top)
  }, [])

  const mustAsk = !fromApp && !confirmed
  const userId = user?.id

  useEffect(() => {
    if (!router.isReady || loading || startedRef.current) return
    if (mustAsk && userId) return // waits for the click
    startedRef.current = true
    const next = safeNext(router.query.next)
    const login = next ? `/login?next=${encodeURIComponent(next)}` : '/login'
    // Opened directly while signed out: nothing to end
    if (mustAsk) {
      routerRef.current.replace(login)
      return
    }
    signOut()
      .catch(() => ({}))
      .then(({ timedOut } = {}) => {
        // A sign-out still stuck on the network would clear whatever session is stored when
        // it ends (even a new one): a full page load drops it
        if (timedOut) window.location.replace(login)
        else routerRef.current.replace(login)
      })
  }, [router.isReady, router.query.next, loading, mustAsk, userId, signOut])

  const text = TEXT[lang || 'en']
  const head = (
    <Head>
      <title>{text.title}</title>
      <meta name="robots" content="noindex, nofollow" />
    </Head>
  )

  if (mustAsk && userId && !loading && lang) {
    return (
      <AuthScreen labelledBy="logout-title">
        {head}
        {!framed && (
          <>
            <AuthHeader
              id="logout-title"
              emoji="👋"
              tone="blue"
              title={text.ask}
              subtitle={
                <>
                  {user.email && (
                    <>
                      {text.signedInAs} <span className={form.email}>{user.email}</span>.{' '}
                    </>
                  )}
                  {text.everywhere}
                </>
              }
            />
            <div className={form.actions}>
              <button type="button" className={`${ui.btn} ${ui.green} ${ui.block}`} onClick={() => setConfirmed(true)}>
                {text.confirm}
              </button>
              <Link href="/" className={`${ui.btn} ${ui.ghost} ${ui.block}`}>
                {text.cancel}
              </Link>
            </div>
          </>
        )}
      </AuthScreen>
    )
  }

  return (
    <>
      {head}
      {/* Once the language is known: the status is announced once, in that language */}
      {lang && <LoadingScreen label={text.label} />}
    </>
  )
}
