import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/utils/supabase/client'
import { endSession, rememberPartialSignOut } from '@/utils/supabase/signOut'
import { clearLinkConfirm } from '@/utils/auth/linkConfirm'

// Role and admin flag come from app_metadata (server-controlled), never user_metadata.
// Only for display and routing: the API re-checks everything (utils/auth/server.js).
function getRoleFromUser(user) {
  if (!user) return null
  return user.app_metadata?.role === 'teacher' ? 'teacher' : 'student'
}

const AuthContext = createContext({
  user: null,
  session: null,
  role: null,
  isAdmin: false,
  loading: true,
  signOut: async () => ({ revoked: false, timedOut: false }),
  refreshUser: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export default function AuthProvider({ children }) {
  const [supabase] = useState(() => createClient())
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!supabase) {
      setLoading(false)
      return undefined
    }
    let active = true

    // getSession() reads the cookie (and refreshes it if needed). Never leave the app
    // stuck on "loading" if that fails: treat it as signed out.
    ;(async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (active) setSession(data?.session ?? null)
      } catch (err) {
        console.error('[auth] getSession failed:', err)
        if (active) setSession(null)
      } finally {
        if (active) setLoading(false)
      }
    })()

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return
      setSession(nextSession ?? null)
      setLoading(false)
    })

    return () => {
      active = false
      data?.subscription?.unsubscribe()
    }
  }, [supabase])

  // Re-reads the user (e.g. after the server changed user_metadata.full_name)
  const refreshUser = useCallback(async () => {
    if (!supabase) return
    const { data } = await supabase.auth.refreshSession()
    if (data?.session) setSession(data.session)
  }, [supabase])

  // Global sign-out on purpose (Wael's choice): signing out ends the sessions on every
  // device ({ scope: 'local' }: this browser only). Never throws and never hangs; this
  // browser is signed out even offline (utils/supabase/signOut.js).
  // Resolves to { revoked, timedOut } (see endSession): revoked is false when the server
  // could not confirm the sign-out.
  const signOut = useCallback(
    async ({ scope = 'global' } = {}) => {
      const result = await endSession(supabase, { scope })
      clearLinkConfirm()
      // /login then says that the other devices may still be signed in
      if (supabase && scope === 'global' && !result.revoked) rememberPartialSignOut()
      setSession(null)
      return result
    },
    [supabase]
  )

  const value = useMemo(() => {
    const user = session?.user ?? null
    return {
      user,
      session,
      role: getRoleFromUser(user),
      isAdmin: user?.app_metadata?.is_admin === true,
      loading,
      signOut,
      refreshUser,
    }
  }, [session, loading, signOut, refreshUser])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
