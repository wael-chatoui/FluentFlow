// The signed-in student (GET /api/me), shared by every student page through the
// cache. Also keeps people on the right page, deep links included: teachers go to
// /teacher, accounts waiting for approval to /pending, and students who haven't
// finished onboarding to /onboarding.
import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { patchCache, useCachedApi } from '@/components/student/cache'

const ME_MAX_AGE = 5 * 60 * 1000

let redirecting = null // target being navigated to (the shell and the page may both ask)

function redirectFor(me) {
  if (!me) return null
  if (me.role === 'teacher') return '/teacher'
  if (me.approved === false) return '/pending'
  if (!me.profile?.onboarded_at) return '/onboarding'
  return null
}

// Only a student who can use the student area is cached: after onboarding (or an
// approval) the next page must not reuse the answer that sent them away.
const keep = (me) => redirectFor(me) === null

/**
 * @param {{ maxAge?: number }} [options]  maxAge 0 = refresh in the background (e.g. the profile page)
 * @returns {{ me: { user: { id, email }, role, approved, isAdmin, profile } | null, error: Error|null,
 *   loading: boolean, reload: () => void }}  `me` stays null while redirecting
 */
export default function useMe({ maxAge = ME_MAX_AGE } = {}) {
  const router = useRouter()
  const { data, error, loading, reload } = useCachedApi('me', '/api/me', { maxAge, keep })
  const target = redirectFor(data)

  useEffect(() => {
    if (!target || redirecting === target) return
    redirecting = target
    router
      .replace(target)
      .catch(() => {}) // cancelled by another navigation: nothing to do
      .finally(() => {
        redirecting = null
      })
  }, [target, router])

  return { me: target ? null : data ?? null, error, loading: loading || Boolean(target), reload }
}

/** After a profile save: every page (and the header avatar) shows the new values at once. */
export function setMeProfile(profile) {
  patchCache('me', (me) => (me ? { ...me, profile: { ...me.profile, ...profile } } : me))
}
