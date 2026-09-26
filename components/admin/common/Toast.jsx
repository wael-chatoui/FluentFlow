import { useEffect, useMemo, useState } from 'react'
import s from '@/components/admin/common/admin.module.css'
import { cx } from '@/components/admin/common/format'

// Module-level store: toasts survive client-side navigation (e.g. "deleted" toast
// shown on the list page after router.push). No provider needed.
const DURATION = 4000
let toasts = []
let nextId = 1
const listeners = new Set()
const timers = new Map()
const viewports = []

function emit() {
  listeners.forEach((fn) => fn(toasts))
}

function dismiss(id) {
  clearTimeout(timers.get(id))
  timers.delete(id)
  toasts = toasts.filter((t) => t.id !== id)
  emit()
}

function show(message, type = 'success', duration = DURATION) {
  const id = nextId++
  toasts = [...toasts.slice(-3), { id, type, message: String(message || '') }]
  emit()
  if (duration > 0) timers.set(id, setTimeout(() => dismiss(id), duration))
  return id
}

const api = {
  show,
  success: (message, duration) => show(message, 'success', duration),
  error: (message, duration) => show(message || 'Une erreur est survenue.', 'error', duration ?? 6000),
  dismiss,
}

/**
 * `const toast = useToast()` → `toast.success('Enregistré ✓')`, `toast.error(err.message)`,
 * `toast.show(msg, 'success'|'error', durationMs)`, `toast.dismiss(id)`. Stable object.
 * Render `<ToastViewport />` once per page (extra instances render nothing).
 */
export function useToast() {
  return api
}

export function ToastViewport() {
  const [items, setItems] = useState(toasts)
  const token = useMemo(() => ({}), [])
  const [isPrimary, setIsPrimary] = useState(false)

  useEffect(() => {
    viewports.push(token)
    const sync = () => setIsPrimary(viewports[0] === token)
    listeners.add(setItems)
    listeners.add(sync)
    setItems(toasts)
    // Re-evaluate every viewport's primary flag
    listeners.forEach((fn) => fn(toasts))
    return () => {
      viewports.splice(viewports.indexOf(token), 1)
      listeners.delete(setItems)
      listeners.delete(sync)
      listeners.forEach((fn) => fn(toasts))
    }
  }, [token])

  // Only the first mounted viewport renders. Two regions: polite for success,
  // assertive for errors.
  if (!isPrimary) return null
  const success = items.filter((t) => t.type !== 'error')
  const errors = items.filter((t) => t.type === 'error')

  const renderToast = (t) => (
    <div key={t.id} className={cx(s.toast, t.type === 'error' ? s.toastError : s.toastSuccess)}>
      <span aria-hidden="true">{t.type === 'error' ? '⚠️' : '✅'}</span>
      <span className={s.toastMsg}>{t.message}</span>
      <button type="button" className={s.toastClose} onClick={() => dismiss(t.id)} aria-label="Fermer la notification">
        ×
      </button>
    </div>
  )

  return (
    <div className={s.toasts}>
      <div role="status" aria-live="polite" className={s.toastRegion}>
        {success.map(renderToast)}
      </div>
      <div role="alert" aria-live="assertive" className={s.toastRegion}>
        {errors.map(renderToast)}
      </div>
    </div>
  )
}

export default ToastViewport
