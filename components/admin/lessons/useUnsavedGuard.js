import { useEffect, useRef } from 'react'
import { useRouter } from 'next/router'

const MESSAGE = 'Tu as des modifications non enregistrées. Quitter quand même ?'

/**
 * Warns before leaving the page while `dirty`: browser prompt on reload/close,
 * confirm() on in-app navigation. Returns a ref: set `.current = true` to skip
 * the guard for a navigation the page triggers itself (e.g. after a delete).
 */
export default function useUnsavedGuard(dirty) {
  const router = useRouter()
  const bypass = useRef(false)

  useEffect(() => {
    if (!dirty) return undefined
    const onBeforeUnload = (e) => {
      if (bypass.current) return undefined
      e.preventDefault()
      e.returnValue = ''
      return ''
    }
    const onRouteChange = (url) => {
      if (bypass.current || url === router.asPath) return
      // eslint-disable-next-line no-alert
      if (window.confirm(MESSAGE)) return
      router.events.emit('routeChangeError')
      // Aborts the Next.js navigation (documented workaround: throw a non-Error)
      // eslint-disable-next-line no-throw-literal
      throw 'Navigation annulée : modifications non enregistrées.'
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    router.events.on('routeChangeStart', onRouteChange)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      router.events.off('routeChangeStart', onRouteChange)
    }
  }, [dirty, router])

  return bypass
}
