// File: /Users/wael/Documents/Preply/webapp/pages/index.js
import { useState } from 'react'

export default function Home() {
  const [studentId, setStudentId] = useState('')
  const [instruction, setInstruction] = useState('')
  const [pdfUrl, setPdfUrl] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setPdfUrl(null)
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, instruction }),
      })
      const data = await res.json()
      if (res.ok) {
        setPdfUrl(data.pdfUrl)
      } else {
        setError(data.error || 'Unexpected error')
      }
    } catch (err) {
      setError(err.message)
    }
    setLoading(false)
  }

  return (
    <div style={{ maxWidth: '600px', margin: '2rem auto', padding: '1rem' }}>
      <h1>Lesson Generator</h1>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <label>
          Student ID:
          <input
            type="text"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            required
            style={{ width: '100%' }}
          />
        </label>
        <label>
          Instruction:
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            required
            rows={4}
            style={{ width: '100%' }}
          />
        </label>
        <button type="submit" disabled={loading} style={{ padding: '0.5rem 1rem' }}>
          {loading ? 'Generating…' : 'Generate Lesson PDF'}
        </button>
      </form>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      {pdfUrl && (
        <p>
          PDF generated: <a href={pdfUrl} target="_blank" rel="noopener noreferrer">Download</a>
        </p>
      )}
    </div>
  )
}
