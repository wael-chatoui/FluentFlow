import { useRef } from 'react'
import styles from '@/components/teacher/dashboard/StudentSearch.module.css'

/**
 * Search box for the student list (controlled). Escape or the × button clears it.
 * @param {{ value: string, onChange: (value: string) => void }} props
 */
export default function StudentSearch({ value, onChange }) {
  const inputRef = useRef(null)

  const clear = () => {
    onChange('')
    inputRef.current?.focus()
  }

  return (
    <div className={styles.search} role="search">
      <label htmlFor="student-search" className="sr-only">
        Rechercher un élève par nom ou e-mail
      </label>
      <span className={styles.icon} aria-hidden="true">🔍</span>
      <input
        ref={inputRef}
        id="student-search"
        type="search"
        className={styles.input}
        placeholder="Rechercher un élève…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault()
            onChange('')
          }
        }}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="search"
      />
      {value && (
        <button type="button" className={styles.clear} onClick={clear} aria-label="Effacer la recherche">
          <span aria-hidden="true">×</span>
        </button>
      )}
    </div>
  )
}
