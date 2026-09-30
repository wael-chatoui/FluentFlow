// /auth/callback — where Google sign-in and the magic links requested from /login land
// (?code=…, PKCE: the link must be opened in the browser that asked for it).
// Same page as /auth/confirm, so every link format works here too (e.g. invitations
// emailed before /auth/confirm existed). Logic: components/auth/landing.js.
import SignInLanding from '@/components/auth/SignInLanding'

export default function AuthCallbackPage() {
  return <SignInLanding />
}
