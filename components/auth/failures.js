// Why a sign-in link or redirect did not work, as fixed English copy.
// Never show the error text found in the URL: anyone can craft
// /auth/callback?error_description=… and it would read like a message from us.

/**
 * @typedef {'cancelled'|'expired'|'other_browser'|'no_account'|'banned'|'invalid'|'unavailable'|'generic'} Failure
 * action: 'login' → button to /login ; 'retry' → "Try again" on the same page
 */
export const FAILURES = {
  cancelled: {
    emoji: '🙈',
    title: 'Sign-in canceled',
    text: 'Google sign-in was canceled. You can try again whenever you’re ready.',
    action: 'login',
    actionLabel: 'Back to sign in',
  },
  expired: {
    emoji: '⌛',
    title: 'This link has expired',
    text: 'Sign-in links work only once and expire after a while. Ask your teacher for a new link, or request one from the sign-in page.',
    action: 'login',
    actionLabel: 'Get a new sign-in link',
  },
  other_browser: {
    emoji: '🔗',
    title: 'Open the link in the same browser',
    text: 'This sign-in link must be opened in the same browser you requested it from. Request a new one here, or ask your teacher for a new link.',
    action: 'login',
    actionLabel: 'Request a new link',
  },
  no_account: {
    emoji: '💌',
    title: 'No account for this address',
    text: 'Access is by invitation only. Ask your teacher to invite you, then use the link they send you.',
    action: 'login',
    actionLabel: 'Back to sign in',
  },
  banned: {
    emoji: '⛔',
    title: 'Account suspended',
    text: 'This account has been suspended. Contact your teacher if you think this is a mistake.',
    action: 'login',
    actionLabel: 'Back to sign in',
  },
  invalid: {
    emoji: '🧩',
    title: 'This link is incomplete',
    text: 'Part of the sign-in link seems to be missing. Copy the whole link again, or ask your teacher for a new one.',
    action: 'login',
    actionLabel: 'Back to sign in',
  },
  unavailable: {
    emoji: '📡',
    title: 'We couldn’t reach the server',
    text: 'Check your internet connection, then try again.',
    action: 'retry',
    actionLabel: 'Try again',
  },
  generic: {
    emoji: '😕',
    title: 'Sign-in didn’t complete',
    text: 'Something went wrong while signing you in. Please try again.',
    action: 'login',
    actionLabel: 'Back to sign in',
  },
}

const CODE_FAILURES = {
  otp_expired: 'expired',
  flow_state_expired: 'expired',
  flow_state_not_found: 'expired',
  refresh_token_not_found: 'expired',
  refresh_token_already_used: 'expired',
  session_expired: 'expired',
  session_not_found: 'expired',
  bad_code_verifier: 'other_browser',
  pkce_code_verifier_not_found: 'other_browser',
  signup_disabled: 'no_account',
  otp_disabled: 'no_account',
  user_not_found: 'no_account',
  user_banned: 'banned',
  bad_jwt: 'invalid',
  invalid_jwt: 'invalid',
  validation_failed: 'invalid',
}

/** Failure for an error carried by the redirect URL (?error=…&error_code=…). */
export function failureFromUrl({ error, errorCode }) {
  if (errorCode && CODE_FAILURES[errorCode]) return CODE_FAILURES[errorCode]
  if (error === 'access_denied') return 'cancelled'
  return 'generic'
}

/** Failure for an AuthError returned by supabase-js (verifyOtp, setSession, code exchange). */
export function failureFromAuthError(error) {
  if (!error) return 'generic'
  if (error.name === 'AuthRetryableFetchError' || error.status === 0) return 'unavailable'
  if (error.name === 'AuthPKCECodeVerifierMissingError') return 'other_browser'
  if (error.name === 'AuthSessionMissingError') return 'expired'
  return CODE_FAILURES[error.code] || 'generic'
}
