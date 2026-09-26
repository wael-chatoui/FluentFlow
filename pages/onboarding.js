import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/components/AuthProvider'

export default function OnboardingPage() {
  const router = useRouter()
  const { user, session, loading, signOut } = useAuth()
  
  const [subjects, setSubjects] = useState([])
  const [teachers, setTeachers] = useState([])
  
  const [selectedSubject, setSelectedSubject] = useState('')
  const [selectedTeacher, setSelectedTeacher] = useState('')
  
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  // Fetch initial data
  useEffect(() => {
    async function fetchData() {
      try {
        const [subRes, teachRes] = await Promise.all([
          fetch('/api/subjects'),
          fetch('/api/teachers')
        ])
        
        if (subRes.ok) {
          const subData = await subRes.json()
          setSubjects(subData.subjects || [])
        }
        
        if (teachRes.ok) {
          const teachData = await teachRes.json()
          setTeachers(teachData.teachers || [])
        }
      } catch (err) {
        console.error('Failed to load onboarding data:', err)
      }
    }
    
    if (user) {
      fetchData()
    }
  }, [user])

  // Redirect if not supposed to be here
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login')
    } else if (!loading && user?.user_metadata?.onboarding_completed) {
      router.replace(user.user_metadata?.role === 'teacher' ? '/teacher' : '/student')
    }
  }, [user, loading, router])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          subjectId: selectedSubject,
          teacherId: selectedTeacher
        })
      })
      
      if (res.ok) {
        // Force reload to get updated token/metadata
        window.location.href = '/student'
      } else {
        const data = await res.json()
        setError(data.error || 'Erreur lors de la validation')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteProfile = async () => {
    if (!confirm('Es-tu sûr(e) de vouloir supprimer ton compte ? Cette action est irréversible.')) {
      return
    }
    
    setDeleting(true)
    setError(null)
    
    try {
      const res = await fetch('/api/student/deleteProfile', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`
        }
      })
      
      if (res.ok) {
        await signOut()
        router.replace('/login')
      } else {
        const data = await res.json()
        setError(data.error || 'Erreur lors de la suppression')
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setDeleting(false)
    }
  }

  if (loading || !user || user.user_metadata?.onboarding_completed) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner-lg" />
      </div>
    )
  }

  return (
    <div className="auth-page">
      <div className="auth-container">
        <div className="auth-card animate-fade-in" style={{ maxWidth: '500px' }}>
          <div className="auth-logo">
            <div className="auth-logo-icon">👋</div>
            <h1>Bienvenue !</h1>
            <p>Complète ton profil pour commencer</p>
          </div>

          <form onSubmit={handleSubmit} className="dashboard-form" style={{ marginTop: '2rem' }}>
            <div className="form-group">
              <label htmlFor="subject" className="label">Choisis ta matière principale</label>
              <select
                id="subject"
                className="select"
                value={selectedSubject}
                onChange={(e) => setSelectedSubject(e.target.value)}
                required
              >
                <option value="">Sélectionner une matière…</option>
                {subjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="teacher" className="label">Choisis ton professeur</label>
              <select
                id="teacher"
                className="select"
                value={selectedTeacher}
                onChange={(e) => setSelectedTeacher(e.target.value)}
                required
              >
                <option value="">Sélectionner un professeur…</option>
                {teachers.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {error && (
              <div className="alert alert-error">⚠️ {error}</div>
            )}

            <div className="form-actions" style={{ marginTop: '2rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <button
                type="submit"
                disabled={submitting || !selectedSubject || !selectedTeacher}
                className="btn btn-primary btn-lg"
                style={{ width: '100%' }}
              >
                {submitting ? 'Validation...' : 'Terminer mon inscription'}
              </button>
              
              <button
                type="button"
                onClick={handleDeleteProfile}
                disabled={deleting || submitting}
                className="btn btn-ghost"
                style={{ color: '#ef4444' }}
              >
                {deleting ? 'Suppression...' : 'Annuler et supprimer mon compte'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
