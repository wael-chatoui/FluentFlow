// /auth/confirm — invitation and sign-in links made by the API
// (?token_hash=…&type=invite|magiclink, verifyOtp: work on any device) and emails from
// the default Supabase templates (#access_token=…&refresh_token=…, setSession).
// Asks before replacing an account already signed in on this browser, and has the user
// confirm the account's email before going on (these links work in any browser, so
// anyone could send theirs: utils/auth/linkConfirm.js). The proxy sends a browser back
// here until that is done. Logic: components/auth/landing.js.
import SignInLanding from '@/components/auth/SignInLanding'

export default function AuthConfirmPage() {
  return <SignInLanding />
}
