import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '@/components/AuthProvider'

export default function TeacherDashboard() {
  const router = useRouter()
  const { user, loading, signOut } = useAuth()

  // Students list
  const [students, setStudents] = useState([])
  const [loadingStudents, setLoadingStudents] = useState(true)

  // Generate lesson
  const [selectedStudent, setSelectedStudent] = useState('')
  const [instruction, setInstruction] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genResult, setGenResult] = useState(null)
  const [genError, setGenError] = useState(null)

  // Create student modal
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState(null)

  const fetchStudents = useCallback(async () => {
    setLoadingStudents(true)
    try {
      const res = await fetch('/api/admin/listStudents')
      if (res.ok) {
        const data = await res.json()
        setStudents(data.students || [])
      }
    } catch (err) {
      console.error('Failed to fetch students:', err)
    }
    setLoadingStudents(false)
  }, [])

  useEffect(() => {
    if (!loading && user) {
      fetchStudents()
    }
  }, [loading, user, fetchStudents])

  const handleGenerate = async (e) => {
    e.preventDefault()
    setGenerating(true)
    setGenResult(null)
    setGenError(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: selectedStudent, instruction }),
      })
      const data = await res.json()
      if (res.ok) {
        setGenResult(data.pdfUrl)
        setInstruction('')
      } else {
        setGenError(data.error || 'Une erreur est survenue')
      }
    } catch (err) {
      setGenError(err.message)
    }
    setGenerating(false)
  }

  const handleCreateStudent = async (e) => {
    e.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      const res = await fetch('/api/admin/createStudent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail,
          password: newPassword,
          fullName: newName,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setShowCreateModal(false)
        setNewEmail('')
        setNewPassword('')
        setNewName('')
        fetchStudents()
      } else {
        setCreateError(data.error || 'Erreur lors de la création')
      }
    } catch (err) {
      setCreateError(err.message)
    }
    setCreating(false)
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

  const displayName = user.user_metadata?.full_name || user.email?.split('@')[0] || 'Wael'

  return (
    <div className="dashboard">
      {/* Header */}
      <header className="dashboard-header">
        <div className="dashboard-header-inner">
          <div className="dashboard-brand">
            <span className="dashboard-brand-icon">🇫🇷</span>
            <h2>Preply Lessons</h2>
            <span className="badge badge-blue" style={{ marginLeft: '0.5rem' }}>
              Teacher
            </span>
          </div>
          <div className="dashboard-user">
            <div className="dashboard-user-info">
              <div className="dashboard-user-name">{displayName}</div>
              <div className="dashboard-user-role">
                <span className="badge badge-blue">Enseignant</span>
              </div>
            </div>
            <div className="dashboard-avatar">
              {displayName.charAt(0).toUpperCase()}
            </div>
            <button onClick={handleSignOut} className="btn btn-ghost btn-sm">
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="dashboard-main">
        <h1 className="dashboard-title animate-fade-in">
          Tableau de bord enseignant 📋
        </h1>
        <p className="dashboard-subtitle animate-fade-in delay-1">
          Gère tes étudiants et génère des leçons personnalisées
        </p>

        {/* Stats */}
        <div className="stats-row animate-fade-in delay-2">
          <div className="stat-card">
            <div className="stat-value">{students.length}</div>
            <div className="stat-label">Étudiants</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">
              {students.filter(
                (s) =>
                  new Date(s.created_at) >
                  new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
              ).length}
            </div>
            <div className="stat-label">Nouveaux (30j)</div>
          </div>
        </div>

        <div className="dashboard-grid">
          {/* Generate Lesson */}
          <div className="dashboard-section animate-fade-in delay-2">
            <div className="dashboard-section-header">
              <h3 className="dashboard-section-title">📝 Générer une leçon</h3>
            </div>
            <div className="dashboard-section-body">
              <form onSubmit={handleGenerate} className="dashboard-form">
                <div className="form-group">
                  <label htmlFor="student-select" className="label">
                    Étudiant
                  </label>
                  <select
                    id="student-select"
                    className="select"
                    value={selectedStudent}
                    onChange={(e) => setSelectedStudent(e.target.value)}
                    required
                  >
                    <option value="">Sélectionner un étudiant…</option>
                    {students.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.user_metadata?.full_name || s.email}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="teacher-instruction" className="label">
                    Instructions
                  </label>
                  <textarea
                    id="teacher-instruction"
                    className="textarea"
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="Ex : Prépare le bilan de la leçon 8 sur le subjonctif…"
                    required
                    rows={4}
                  />
                </div>
                <div className="form-actions">
                  <button
                    type="submit"
                    disabled={generating || !selectedStudent || !instruction.trim()}
                    className="btn btn-primary btn-lg"
                    style={{ width: '100%' }}
                  >
                    {generating ? (
                      <>
                        <span className="spinner" /> Génération…
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

          {/* Students List */}
          <div className="dashboard-section animate-fade-in delay-3">
            <div className="dashboard-section-header">
              <h3 className="dashboard-section-title">👥 Étudiants</h3>
              <button
                onClick={() => setShowCreateModal(true)}
                className="btn btn-primary btn-sm"
              >
                + Ajouter
              </button>
            </div>

            {loadingStudents ? (
              <div className="dashboard-section-body" style={{ textAlign: 'center', padding: '2rem' }}>
                <div className="spinner" style={{ margin: '0 auto' }} />
              </div>
            ) : students.length === 0 ? (
              <div className="dashboard-section-body">
                <div className="empty-state">
                  <div className="empty-state-icon">👤</div>
                  <div className="empty-state-title">Aucun étudiant</div>
                  <div className="empty-state-text">
                    Ajoute ton premier étudiant avec le bouton ci-dessus
                  </div>
                </div>
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th>Étudiant</th>
                      <th>Inscrit le</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <div className="student-row">
                            <div className="student-avatar-sm">
                              {(s.user_metadata?.full_name || s.email || '?')
                                .charAt(0)
                                .toUpperCase()}
                            </div>
                            <div className="student-info">
                              <span className="student-name">
                                {s.user_metadata?.full_name || '—'}
                              </span>
                              <span className="student-email">{s.email}</span>
                            </div>
                          </div>
                        </td>
                        <td>
                          {new Date(s.created_at).toLocaleDateString('fr-FR', {
                            day: 'numeric',
                            month: 'short',
                            year: 'numeric',
                          })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Create Student Modal */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">➕ Ajouter un étudiant</h3>
            <form onSubmit={handleCreateStudent} className="dashboard-form">
              <div className="form-group">
                <label htmlFor="new-name" className="label">Nom complet</label>
                <input
                  id="new-name"
                  type="text"
                  className="input"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Rebecca M."
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="new-email" className="label">Email</label>
                <input
                  id="new-email"
                  type="email"
                  className="input"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="rebecca@example.com"
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="new-password" className="label">Mot de passe</label>
                <input
                  id="new-password"
                  type="password"
                  className="input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Minimum 6 caractères"
                  minLength={6}
                  required
                />
              </div>
              {createError && (
                <div className="alert alert-error">⚠️ {createError}</div>
              )}
              <div className="form-actions">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="btn btn-primary"
                  style={{ flex: 1 }}
                >
                  {creating ? (
                    <>
                      <span className="spinner" /> Création…
                    </>
                  ) : (
                    'Créer le compte'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
