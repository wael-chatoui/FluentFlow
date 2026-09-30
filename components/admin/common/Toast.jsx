import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import s from '@/components/admin/common/admin.module.css'
import { cx } from '@/components/admin/common/format'
import { CircleAlert, CircleCheck, X } from 'lucide-react'
import Icon from '@/components/ui/Icon'

// Module-level store: toasts survive client-side navigation (e.g. "deleted" toast
// shown on the list page after router.push). No provider needed.
const DURATION = 4000
let toasts = []
let nextId = 1
const listeners = new Set()
const timers = new Map()
const viewports = []
// Open modals (Modal.jsx, native modal <dialog>): the page behind them is inert and
// below the top layer, so toasts render inside the topmost one while it is open.
const hosts = []

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

/** Makes `ref`'s element (inside an open modal) the place where toasts render until it unmounts. */
export function useToastHost(ref) {
  useEffect(() => {
    const host = ref.current
    if (!host) return undefined
    hosts.push(host)
    emit()
    return () => {
      hosts.splice(hosts.indexOf(host), 1)
      emit()
    }
  }, [ref])
}

export function ToastViewport() {
  const [items, setItems] = useState(toasts)
  const token = useMemo(() => ({}), [])
  const [isPrimary, setIsPrimary] = useState(false)
  const [host, setHost] = useState(null)

  useEffect(() => {
    viewports.push(token)
    const sync = () => {
      setIsPrimary(viewports[0] === token)
      setHost(hosts[hosts.length - 1] || null)
    }
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
      <Icon icon={t.type === 'error' ? CircleAlert : CircleCheck} size={20} />
      <span className={s.toastMsg}>{t.message}</span>
      <button type="button" className={s.toastClose} onClick={() => dismiss(t.id)} aria-label="Fermer la notification">
        <Icon icon={X} size={18} />
      </button>
    </div>
  )

  const viewport = (
    <div className={s.toasts}>
      <div role="status" aria-live="polite" className={s.toastRegion}>
        {success.map(renderToast)}
      </div>
      <div role="alert" aria-live="assertive" className={s.toastRegion}>
        {errors.map(renderToast)}
      </div>
    </div>
  )
  return host ? createPortal(viewport, host) : viewport
}

export default ToastViewport
