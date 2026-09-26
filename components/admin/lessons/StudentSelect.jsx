import { useId, useMemo, useState } from 'react'
import Link from 'next/link'
import useAdminQuery from '@/components/admin/common/useAdminQuery'
import { cx, displayName } from '@/components/admin/common/format'
import admin from '@/components/admin/common/admin.module.css'
import styles from '@/components/admin/lessons/editor.module.css'

/**
 * Searchable student picker: a filter input + a native <select> (accessible and
 * mobile-friendly). Fed by GET /api/admin/users?role=student&perPage=200.
 */
export default function StudentSelect({ value, onChange, error, fallbackName }) {
  const uid = useId()
  const [filter, setFilter] = useState('')
  const { data, error: loadError, loading, reload } = useAdminQuery('/api/admin/users?role=student&perPage=200')
  const students = useMemo(() => data?.users || [], [data])

  const current = students.find((u) => u.id === value)
  const options = useMemo(() => {
    const q = filter.trim().toLowerCase()
    const list = q
      ? students.filter((u) => `${u.full_name || ''} ${u.email || ''}`.toLowerCase().includes(q))
      : students
    // Always keep the selected student visible
    if (value && !list.some((u) => u.id === value)) {
      return [current || { id: value, full_name: fallbackName || 'Élève actuel', email: '' }, ...list]
    }
    return list
  }, [students, filter, value, current, fallbackName])

  const errorId = error ? `${uid}-err` : undefined
  const hintId = `${uid}-hint`

  return (
    <div className={admin.field}>
      <label htmlFor={`${uid}-select`} className={admin.label}>
        Élève
      </label>
      <input
        type="search"
        className={admin.input}
        value={filter}
        placeholder="Filtrer par nom ou e-mail…"
        aria-label="Filtrer la liste des élèves"
        aria-controls={`${uid}-select`}
        onChange={(e) => setFilter(e.target.value)}
      />
      <select
        id={`${uid}-select`}
        className={cx(admin.input, admin.select, error && admin.invalid)}
        value={value}
        disabled={loading && students.length === 0}
        aria-invalid={error ? true : undefined}
        aria-describedby={[errorId, hintId].filter(Boolean).join(' ')}
        onChange={(e) => onChange(e.target.value)}
      >
        {!value && <option value="">— Choisir un élève —</option>}
        {options.map((u) => (
          <option key={u.id} value={u.id}>
            {displayName(u)}
            {u.email && u.full_name ? ` · ${u.email}` : ''}
          </option>
        ))}
      </select>
      <p id={hintId} className={admin.hint}>
        {loading && students.length === 0
          ? 'Chargement des élèves…'
          : `${options.length} élève${options.length > 1 ? 's' : ''}${filter ? ' correspondant(s)' : ''}.`}{' '}
        {value && (
          <Link href={`/admin/users/${value}`} className={admin.link}>
            Voir la fiche
          </Link>
        )}
      </p>
      {loadError && (
        <p className={admin.fieldError}>
          {loadError}{' '}
          <button type="button" className={styles.linkBtn} onClick={reload}>
            Réessayer
          </button>
        </p>
      )}
      {error && (
        <p id={errorId} className={admin.fieldError}>
          {error}
        </p>
      )}
    </div>
  )
}
