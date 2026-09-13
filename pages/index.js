import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/components/AuthProvider'

/**
 * Root page — redirects based on auth state:
 * - Not logged in → /login
 * - Teacher → /teacher
 * - Student (or any other role) → /student
 */
export default function Home() {
  const router = useRouter()
  const { user, role, loading } = useAuth()

  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.replace('/login')
      } else if (role === 'teacher') {
        router.replace('/teacher')
      } else {
        router.replace('/student')
      }
    }
  }, [user, role, loading, router])

  return (
    <div className="loading-screen">
      <div className="spinner spinner-lg" />
    </div>
  )
}
