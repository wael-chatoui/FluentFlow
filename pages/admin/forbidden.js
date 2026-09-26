import Head from 'next/head'
import ui from '@/components/ui/ui.module.css'

// Shown by proxy.js to signed-in users without the admin flag. Public on purpose.
export default function AdminForbidden() {
  return (
    <div className={ui.theme} style={{ display: 'grid', placeItems: 'center', padding: '1.5rem' }}>
      <Head>
        <title>Accès refusé · Back office</title>
        <meta name="robots" content="noindex, nofollow" />
      </Head>
      <div className={ui.card} style={{ maxWidth: 420, textAlign: 'center' }}>
        <div style={{ fontSize: '3rem' }} aria-hidden="true">🔒</div>
        <h1 style={{ margin: '0.5rem 0', fontSize: '1.5rem', fontWeight: 900 }}>Accès réservé</h1>
        <p style={{ color: 'var(--st-ink-soft)', marginBottom: '1.25rem' }}>
          Ce back office est réservé aux administrateurs. Connecte-toi avec un compte admin.
        </p>
        <a href="/login" className={`${ui.btn} ${ui.blue} ${ui.block}`}>
          Changer de compte
        </a>
      </div>
    </div>
  )
}
