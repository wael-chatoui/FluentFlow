import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/components/AuthProvider'
import { createClient } from '@/utils/supabase/client'

export default function StudentDashboard() {
  const router = useRouter()
  const { user, role, loading, signOut } = useAuth()
  const [supabase] = useState(() => createClient())

  // Generate lesson form
  const [instruction, setInstruction] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState(null)
  const [genError, setGenError] = useState(null)

  // Lesson history
  const [lessons, setLessons] = useState([])
  const [loadingLessons, setLoadingLessons] = useState(true)

  const fetchLessons = useCallback(async () => {
    if (!user) return
    setLoadingLessons(true)
    try {
      const res = await fetch('/api/lessons')
      if (res.ok) {
        const data = await res.json()
        setLessons(data.lessons || [])
      }
    } catch (err) {
      console.error('Failed to fetch lessons:', err)
    }
    setLoadingLessons(false)
  }, [user])

  useEffect(() => {
    if (!loading && user) {
      fetchLessons()
    }
  }, [loading, user, fetchLessons])

  const handleGenerate = async (e) => {
    e.preventDefault()
    setGenerating(true)
    setGenResult(null)
    setGenError(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: user.id, instruction }),
      })
      const data = await res.json()
      if (res.ok) {
        setGenResult(data.pdfUrl)
        setInstruction('')
        fetchLessons() // Refresh the list
      } else {
        setGenError(data.error || 'Une erreur est survenue')
      }
    } catch (err) {
      setGenError(err.message)
    }
    setGenerating(false)
  }

  const handleSignOut = async () => {
    await signOut()
    router.replace('/login')
  }

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner spinner-lg" />
      </div>
    )
  }

  if (!user) return null

  const initials = (user.user_metadata?.full_name || user.email || '?')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Étudiant'

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <div className="dashboard-brand">
            <span className="dashboard-brand-icon">🇫🇷</span>
            <h2>Preply Lessons</h2>
          </div>
          <div className="dashboard-user">
            <div className="dashboard-user-info">
              <div className="dashboard-user-name">{displayName}</div>
              <div className="dashboard-user-role">
                <span className="badge badge-pink">Étudiant</span>
              </div>
            </div>
            <div className="dashboard-avatar">{initials}</div>
            <button onClick={handleSignOut} className="btn btn-ghost btn-sm">
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="dashboard-main">
        <h1 className="dashboard-title animate-fade-in">
          Bonjour, {displayName.split(' ')[0]} 👋
        </h1>
        <p className="dashboard-subtitle animate-fade-in delay-1">
          Prêt pour ta prochaine leçon de français ?
        </p>

        {/* Stats */}
        <div className="stats-row animate-fade-in delay-2">
          <div className="stat-card">
            <div className="stat-value">{lessons.length}</div>
            <div className="stat-label">Leçons générées</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {lessons.length > 0
                ? new Date(lessons[0]?.lastModified || Date.now()).toLocaleDateString('fr-FR', {
                    day: 'numeric',
                    month: 'short',
                  })
                : '—'}
            </div>
            <div className="stat-label">Dernière leçon</div>
          </div>
        </div>

        <div className="dashboard-grid">
          {/* Generate Form */}
          <div className="dashboard-section animate-fade-in delay-2">
            <div className="dashboard-section-header">
              <h3 className="dashboard-section-title">📝 Générer une leçon</h3>
            </div>
            <div className="dashboard-section-body">
              <form onSubmit={handleGenerate} className="dashboard-form">
                <div className="form-group">
                  <label htmlFor="instruction" className="label">
                    Instructions pour le cours
                  </label>
                  <textarea
                    id="instruction"
                    className="textarea"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="Ex : Prépare un bilan de la leçon d'aujourd'hui sur les expressions idiomatiques…"
                    required
                    rows={4}
                  />
                </div>
                <div className="form-actions">
                  <button
                    type="submit"
                    disabled={generating || !instruction.trim()}
                    className="btn btn-primary btn-lg"
                    style={{ width: '100%' }}
                  >
                    {generating ? (
                      <>
                        <span className="spinner" /> Génération en cours…
                      </>
                    ) : (
                      '✨ Générer le PDF'
                    )}
                  </button>
                </div>
              </form>

              {genError && (
                <div className="alert alert-error" style={{ marginTop: '1rem' }}>
                  ⚠️ {genError}
                </div>
              )}

              {genResult && (
                <div className="alert alert-success" style={{ marginTop: '1rem' }}>
                  ✅ PDF généré !{' '}
                  <a href={genResult} target="_blank" rel="noopener noreferrer">
                    Télécharger
                  </a>
                </div>
              )}
            </div>
          </div>

          {/* Lesson History */}
          <div className="dashboard-section animate-fade-in delay-3">
            <div className="dashboard-section-header">
              <h3 className="dashboard-section-title">📚 Historique des leçons</h3>
              <button onClick={fetchLessons} className="btn btn-ghost btn-sm">
                ↻ Rafraîchir
              </button>
            </div>

            {loadingLessons ? (
              <div className="dashboard-section-body" style={{ textAlign: 'center', padding: '2rem' }}>
                <div className="spinner" style={{ margin: '0 auto' }} />
              </div>
            ) : lessons.length === 0 ? (
              <div className="dashboard-section-body">
                <div className="empty-state">
                  <div className="empty-state-icon">📄</div>
                  <div className="empty-state-title">Pas encore de leçon</div>
                  <div className="empty-state-text">
                    Génère ta première leçon avec le formulaire ci-dessus !
                  </div>
                </div>
              </div>
            ) : (
              <ul className="lesson-list">
                {lessons.map((lesson, i) => (
                  <li key={lesson.name || i} className="lesson-item">
                    <div className="lesson-item-info">
                      <span className="lesson-item-name">
                        📄 {lesson.name?.replace('.pdf', '') || `Leçon ${i + 1}`}
                      </span>
                      {lesson.lastModified && (
                        <span className="lesson-item-date">
                          {new Date(lesson.lastModified).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                          })}
                        </span>
                      )}
                    </div>
                    <div className="lesson-item-actions">
                      <a
                        href={lesson.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn btn-secondary btn-sm"
                      >
                        Ouvrir
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
