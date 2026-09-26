import { createContext, useContext, useState, useEffect } from 'react'
import { createClient } from '@/utils/supabase/client'

// Role comes from app_metadata (server-controlled), never user_metadata
function getRoleFromUser(user) {
  if (!user) return null
  return user.app_metadata?.role === 'teacher' ? 'teacher' : 'student'
}

const AuthContext = createContext({
  user: null,
  session: null,
  role: null,
  loading: true,
  signOut: async () => {},
  refreshUser: async () => {},
})

export function useAuth() {
  return useContext(AuthContext)
}

export default function AuthProvider({ children }) {
  const [supabase] = useState(() => createClient())
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [role, setRole] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s)
      setUser(s?.user ?? null)
      setRole(getRoleFromUser(s?.user))
      setLoading(false)
    })

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s)
      setUser(s?.user ?? null)
      setRole(getRoleFromUser(s?.user))
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [supabase])

  // Re-reads the user (e.g. after the server changed user_metadata.full_name)
  const refreshUser = async () => {
    const { data } = await supabase.auth.refreshSession()
    if (data?.user) setUser(data.user)
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setRole(null)
  }

  return (
    <AuthContext.Provider value={{ user, session, role, loading, signOut, refreshUser }}>
      {children}
    </AuthContext.Provider>
  )
}
