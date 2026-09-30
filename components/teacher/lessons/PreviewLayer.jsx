import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from '@/components/teacher/lessons/PreviewLayer.module.css'

/**
 * Full-screen modal layer of the teacher's « Tester les exercices » preview. Rendered at the
 * end of <body> while the app root (#__next) is inert, so Tab / Shift+Tab and screen readers
 * cannot reach the lesson page hidden behind (tabs, « Supprimer », the undo toast, the
 * navigation). Its opaque background also covers the page while the player chunk loads.
 * @param {{ label: string, children: React.ReactNode }} props
 */
export default function PreviewLayer({ label, children }) {
  const [host, setHost] = useState(null)
  const layerRef = useRef(null)

  // Layout effect: on close the page stops being inert before the opener gets the focus
  // back (only rendered in the browser, once the teacher opens the preview)
  useLayoutEffect(() => {
    const root = document.getElementById('__next')
    const wasInert = Boolean(root?.hasAttribute('inert'))
    if (root && !wasInert) root.setAttribute('inert', '')
    setHost(document.body)
    return () => {
      if (root && !wasInert) root.removeAttribute('inert')
    }
  }, [])

  // The opener is now inert (its focus is lost): land in the dialog, unless the player
  // (already loaded) has focused its first exercise
  useEffect(() => {
    const layer = layerRef.current
    if (layer && !layer.contains(document.activeElement)) layer.focus({ preventScroll: true })
  }, [host])

  if (!host) return null
  return createPortal(
    <div ref={layerRef} className={styles.layer} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
      {children}
    </div>,
    host
  )
}
