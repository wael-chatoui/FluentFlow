import useUnsavedGuard from '@/components/ui/useUnsavedGuard'

/**
 * Leave guard for a practice run: reload/close, in-app links and the browser
 * back/forward buttons (all handled by useUnsavedGuard). Returns the bypass ref
 * (set it before leaving on purpose).
 * @param {boolean} active
 * @param {string} message  confirm() text
 */
export default function useLeaveGuard(active, message) {
  return useUnsavedGuard(active, message)
}
