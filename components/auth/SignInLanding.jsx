import Head from 'next/head'
import LoadingScreen from '@/components/ui/LoadingScreen'
import AuthScreen, { AuthHeader } from '@/components/auth/AuthScreen'
import SignInProblem from '@/components/auth/SignInProblem'
import useSignInLanding from '@/components/auth/useSignInLanding'
import { establishSession, readLandingParams } from '@/components/auth/landing'
import ui from '@/components/ui/ui.module.css'
import form from '@/components/auth/AuthForm.module.css'

/**
 * Page body of /auth/callback and /auth/confirm: signs the user in from the link,
 * then goes where pathAfterSignIn() says (GET /api/me), honoring a safe ?next=.
 * Never hangs and never shows text taken from the URL.
 */
export default function SignInLanding() {
  const { status, failure, email, next, retry, continueWithLink, stay, confirm, notMe } = useSignInLanding(
    readLandingParams,
    establishSession
  )

  const head = (
    <Head>
      <title>Signing in · Preply Lessons</title>
      <meta name="robots" content="noindex, nofollow" />
      <meta name="referrer" content="no-referrer" />
    </Head>
  )

  if (status === 'failed') {
    return (
      <>
        {head}
        <SignInProblem failure={failure} onRetry={retry} loginHref={next ? `/login?next=${encodeURIComponent(next)}` : '/login'} />
      </>
    )
  }

  if (status === 'switch') {
    return (
      <AuthScreen labelledBy="switch-title">
        {head}
        <AuthHeader
          id="switch-title"
          emoji="👋"
          tone="blue"
          title="You’re already signed in"
          subtitle={
            <>
              This browser is signed in as <span className={form.email}>{email || 'another account'}</span>. The link you
              opened may be for someone else.
            </>
          }
        />
        <div className={form.actions}>
          <button type="button" className={`${ui.btn} ${ui.green} ${ui.block}`} onClick={continueWithLink}>
            Use this link
          </button>
          <button type="button" className={`${ui.btn} ${ui.ghost} ${ui.block}`} onClick={stay}>
            Keep my current account
          </button>
        </div>
        <p className={form.note}>
          <span className={form.noteIcon} aria-hidden="true">
            💡
          </span>
          <span>“Use this link” signs this browser into the account the link was made for. The link works only once.</span>
        </p>
      </AuthScreen>
    )
  }

  // A link signed this browser in: whose account is it? (login CSRF, utils/auth/linkConfirm.js)
  if (status === 'confirm') {
    return (
      <AuthScreen labelledBy="confirm-title">
        {head}
        <AuthHeader
          id="confirm-title"
          emoji="🔑"
          tone="green"
          title="Is this your account?"
          subtitle={
            <>
              This link signs you in as <span className={form.email}>{email || 'an account without an email address'}</span>.
            </>
          }
        />
        <div className={form.actions}>
          <button type="button" className={`${ui.btn} ${ui.green} ${ui.block}`} onClick={confirm}>
            Yes, continue
          </button>
          <button type="button" className={`${ui.btn} ${ui.ghost} ${ui.block}`} onClick={notMe}>
            No, that’s not me
          </button>
        </div>
        <p className={form.note}>
          <span className={form.noteIcon} aria-hidden="true">
            💡
          </span>
          <span>
            A sign-in link opens the account it was made for. If this isn’t your email address, don’t continue: ask your
            teacher for your own link.
          </span>
        </p>
      </AuthScreen>
    )
  }

  if (status === 'leaving') {
    return (
      <>
        {head}
        <LoadingScreen label="Signing out…" />
      </>
    )
  }

  return (
    <>
      {head}
      <LoadingScreen message="Signing you in…" />
    </>
  )
}
