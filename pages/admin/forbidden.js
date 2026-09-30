import { useEffect, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useAuth } from '@/components/AuthProvider'
import AuthScreen, { AuthHeader } from '@/components/auth/AuthScreen'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/auth/AuthForm.module.css'

// Link back to the main app when the back office runs on its own domain
function useAppHome() {
  const [home, setHome] = useState(null)
  useEffect(() => {
    const site = (process.env.NEXT_PUBLIC_SITE_URL || '').trim()
    if (!site) return
    try {
      const origin = new URL(site).origin
      setHome(origin === window.location.origin ? '/' : origin)
    } catch {
      // Malformed NEXT_PUBLIC_SITE_URL: no link
    }
  }, [])
  return home
}

/**
 * Shown by proxy.js to signed-in users without the admin flag. Public on purpose.
 * Both actions go through /logout, which works on the back-office host too (the
 * proxy keeps every other path inside /admin there, so /login alone would loop back).
 */
export default function AdminForbidden() {
  const { user } = useAuth()
  const home = useAppHome()

  return (
    <AuthScreen labelledBy="forbidden-title">
      <Head>
        <title>Accès refusé · Back office</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <AuthHeader
        id="forbidden-title"
        emoji="🔒"
        tone="red"
        title="Accès réservé"
        subtitle="Ce back office est réservé aux administrateurs. Connecte-toi avec un compte admin."
      />
      <div className={styles.panel}>
        {user?.email && (
          <p className={`${styles.text} ${styles.soft}`}>
            Connecté en tant que <span className={styles.email}>{user.email}</span>
          </p>
        )}
        <div className={styles.actions}>
          <Link href="/logout?next=%2Fadmin" className={`${ui.btn} ${ui.blue} ${ui.block}`}>
            Changer de compte
          </Link>
          <Link href="/logout" className={`${ui.btn} ${ui.ghost} ${ui.block}`}>
            Se déconnecter
          </Link>
          {home && (
            <a href={home} className={styles.textButton}>
              Retour à l’application
            </a>
          )}
        </div>
      </div>
    </AuthScreen>
  )
}
