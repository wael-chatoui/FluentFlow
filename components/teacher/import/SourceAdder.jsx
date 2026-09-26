import { useId, useRef, useState } from 'react'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/import/SourceAdder.module.css'

function hasFiles(e) {
  return Array.from(e.dataTransfer?.types || []).includes('Files')
}

/**
 * Drop zone (also a keyboard-operable button opening the file picker) and a
 * "paste a Google Docs / Drive link" field.
 * @param {{ disabled?: boolean, full?: boolean, onFiles: (files: File[]) => void,
 *   onLink: (url: string) => string | null }} props
 *   `onLink` returns a French error message, or null when the link was added.
 */
export default function SourceAdder({ disabled = false, full = false, onFiles, onLink }) {
  const uid = useId()
  const inputRef = useRef(null)
  const dragDepth = useRef(0)
  const [dragging, setDragging] = useState(false)
  const [link, setLink] = useState('')
  const [linkError, setLinkError] = useState(null)
  const off = disabled || full

  const openPicker = () => {
    if (off) return
    inputRef.current?.click()
  }

  const handleInput = (e) => {
    const files = Array.from(e.target.files || [])
    // Reset so picking the same file again still fires `change`
    e.target.value = ''
    if (files.length) onFiles(files)
  }

  const handleDragEnter = (e) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragDepth.current += 1
    if (!off) setDragging(true)
  }

  const handleDragOver = (e) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = off ? 'none' : 'copy'
  }

  const handleDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  const handleDrop = (e) => {
    if (!hasFiles(e)) return
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    if (off) return
    const files = Array.from(e.dataTransfer.files || [])
    if (files.length) onFiles(files)
  }

  const handleLinkSubmit = (e) => {
    e.preventDefault()
    if (off) return
    const error = onLink(link)
    if (error) {
      setLinkError(error)
      return
    }
    setLink('')
    setLinkError(null)
  }

  const linkId = `${uid}-link`
  const linkErrorId = `${uid}-link-error`

  return (
    <div className={styles.adder}>
      <div
        className={`${styles.zone} ${dragging ? styles.dragging : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <button
          type="button"
          className={styles.zoneButton}
          onClick={openPicker}
          disabled={off}
          aria-describedby={`${uid}-zone-hint`}
        >
          <span className={styles.zoneIcon} aria-hidden="true">{dragging ? '📥' : '📄'}</span>
          <span className={styles.zoneTitle}>
            {dragging ? 'Lâche tes PDF ici !' : 'Glisse tes PDF ici'}
          </span>
          <span className={styles.zoneOr} aria-hidden="true">ou</span>
          <span className={styles.zoneCta}>Choisir des fichiers</span>
        </button>
        <p id={`${uid}-zone-hint`} className={styles.zoneHint}>
          {full ? 'Maximum 20 documents par import atteint.' : 'PDF uniquement · 4 Mo max par fichier · 20 documents max'}
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf"
          multiple
          className={styles.fileInput}
          onChange={handleInput}
          tabIndex={-1}
          aria-hidden="true"
        />
      </div>

      <form className={styles.linkForm} onSubmit={handleLinkSubmit} noValidate>
        <label htmlFor={linkId} className={bits.label}>
          Coller un lien Google Docs / Drive
        </label>
        <div className={styles.linkRow}>
          <input
            id={linkId}
            type="url"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            className={`${bits.input} ${styles.linkInput} ${linkError ? bits.invalid : ''}`}
            placeholder="https://docs.google.com/document/d/…"
            value={link}
            onChange={(e) => {
              setLink(e.target.value)
              if (linkError) setLinkError(null)
            }}
            disabled={off}
            aria-invalid={Boolean(linkError) || undefined}
            aria-describedby={linkError ? linkErrorId : `${uid}-link-hint`}
          />
          <button
            type="submit"
            className={`${ui.btn} ${ui.blue} ${styles.linkButton}`}
            disabled={off || !link.trim()}
          >
            <span aria-hidden="true">🔗</span> Ajouter
          </button>
        </div>
        {linkError ? (
          <p id={linkErrorId} className={bits.fieldError} role="alert">
            <span aria-hidden="true">⚠️</span> {linkError}
          </p>
        ) : (
          <p id={`${uid}-link-hint`} className={bits.hint}>
            Le document doit être partagé en « Tous les utilisateurs disposant du lien ».
          </p>
        )}
      </form>
    </div>
  )
}
