// Shared by the sign-in forms (/login, /join/<token>): English messages, Supabase Auth
// error checks and the landing URL a sign-in comes back to.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
// Supabase accepts one sign-in email per address per minute (default settings)
export const RESEND_COOLDOWN_S = 60

export const MESSAGES = {
  invalidEmail: 'Enter a valid email address, like name@example.com.',
  rateLimited: 'Too many sign-in emails were requested. Please wait a minute and try again.',
  network: 'We couldn’t reach the server. Check your connection and try again.',
  sendFailed: 'We couldn’t send the email right now. Please try again in a few minutes.',
  google: 'Google sign-in couldn’t start. Please try again.',
  banned: 'This account has been suspended. Contact your teacher if you think this is a mistake.',
  signedOutHereOnly:
    'You’re signed out on this device. We couldn’t reach the server to sign you out on your other devices: sign out there too if needed.',
}

export const isRateLimited = (error) =>
  error?.status === 429 || /rate.?limit/i.test(`${error?.code || ''} ${error?.message || ''}`)
export const isNetworkError = (error) => error?.name === 'AuthRetryableFetchError' || error?.status === 0
// Email provider or Auth server failure. An unknown address gets a 4xx, so saying so
// does not reveal which addresses have an account.
export const isServerError = (error) => Number(error?.status) >= 500

/** /auth/callback on this origin, with the page to come back to as ?next=. */
export function redirectUrl(next) {
  return `${window.location.origin}/auth/callback${next ? `?next=${encodeURIComponent(next)}` : ''}`
}
