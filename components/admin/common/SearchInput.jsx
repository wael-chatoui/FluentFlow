import { useEffect, useId, useRef, useState } from 'react'
import s from '@/components/admin/common/admin.module.css'
import { cx } from '@/components/admin/common/format'
import { Search, X } from 'lucide-react'
import Icon from '@/components/ui/Icon'

/**
 * Search field that calls `onChange(text)` 300 ms after the user stops typing.
 * Escape (or the × button) clears it immediately. Syncs when `value` changes from outside.
 * @param {{ value: string, onChange: (value: string) => void, placeholder?: string, label?: string, delay?: number }} props
 */
export default function SearchInput({ value, onChange, placeholder = 'Rechercher…', label, delay = 300 }) {
  const id = useId()
  const [text, setText] = useState(value || '')
  const timer = useRef(null)
  const lastEmitted = useRef(value || '')
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  // External changes (e.g. URL → state) win over the local text
  useEffect(() => {
    const next = value || ''
    if (next !== lastEmitted.current) {
      lastEmitted.current = next
      clearTimeout(timer.current)
      setText(next)
    }
  }, [value])

  useEffect(() => () => clearTimeout(timer.current), [])

  const emit = (next) => {
    clearTimeout(timer.current)
    if (next === lastEmitted.current) return
    lastEmitted.current = next
    onChangeRef.current?.(next)
  }

  const handleChange = (e) => {
    const next = e.target.value
    setText(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => emit(next.trim()), delay)
  }

  const clear = () => {
    setText('')
    emit('')
  }

  return (
    <div className={s.search} role="search">
      <label htmlFor={id} className="sr-only">
        {label || placeholder}
      </label>
      <Icon icon={Search} size={18} className={s.searchIcon} />
      <input
        id={id}
        type="search"
        className={cx(s.input, s.searchInput)}
        value={text}
        onChange={handleChange}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && text) {
            e.preventDefault()
            e.stopPropagation()
            clear()
          } else if (e.key === 'Enter') {
            e.preventDefault()
            emit(text.trim())
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="none"
        spellCheck={false}
        enterKeyHint="search"
      />
      {text && (
        <button type="button" className={s.searchClear} onClick={clear} aria-label="Effacer la recherche">
          <Icon icon={X} size={18} />
        </button>
      )}
    </div>
  )
}
