import { useEffect, useRef } from 'react'
import styles from '@/components/teacher/Tabs.module.css'

/**
 * Accessible tab list styled as a segmented control (WAI-ARIA tabs pattern,
 * manual activation with arrows/Home/End). Scrolls horizontally when it does
 * not fit (small phones); the active tab is kept in view.
 * Panels must use id `${idPrefix}-panel-${key}` and aria-labelledby `${idPrefix}-tab-${key}`.
 * @param {{ tabs: { key: string, label: React.ReactNode, count?: number }[], active: string,
 *   onChange: (key: string) => void, idPrefix: string, label: string }} props
 */
export default function Tabs({ tabs, active, onChange, idPrefix, label }) {
  const refs = useRef({})
  const scrollerRef = useRef(null)

  // Keep the active tab visible inside the scroller (horizontal only: never scrolls the page)
  useEffect(() => {
    const scroller = scrollerRef.current
    const el = refs.current[active]
    if (!scroller || !el || scroller.scrollWidth <= scroller.clientWidth) return
    const left = el.offsetLeft - 8
    const right = el.offsetLeft + el.offsetWidth + 8
    if (left < scroller.scrollLeft) scroller.scrollLeft = left
    else if (right > scroller.scrollLeft + scroller.clientWidth) scroller.scrollLeft = right - scroller.clientWidth
  }, [active])

  const focusTab = (index) => {
    const tab = tabs[(index + tabs.length) % tabs.length]
    onChange(tab.key)
    refs.current[tab.key]?.focus()
  }

  const onKeyDown = (e, index) => {
    if (e.key === 'ArrowRight') focusTab(index + 1)
    else if (e.key === 'ArrowLeft') focusTab(index - 1)
    else if (e.key === 'Home') focusTab(0)
    else if (e.key === 'End') focusTab(tabs.length - 1)
    else return
    e.preventDefault()
  }

  return (
    <div ref={scrollerRef} className={styles.scroller}>
      <div role="tablist" aria-label={label} className={styles.list}>
        {tabs.map((tab, index) => {
          const selected = tab.key === active
          return (
            <button
              key={tab.key}
              ref={(el) => {
                refs.current[tab.key] = el
              }}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${tab.key}`}
              aria-selected={selected}
              aria-controls={`${idPrefix}-panel-${tab.key}`}
              tabIndex={selected ? 0 : -1}
              className={`${styles.tab} ${selected ? styles.active : ''}`}
              onClick={() => onChange(tab.key)}
              onKeyDown={(e) => onKeyDown(e, index)}
            >
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && <span className={styles.count}>{tab.count}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}
