import { useRef } from 'react'
import styles from '@/components/teacher/Tabs.module.css'

/**
 * Accessible tab list (WAI-ARIA tabs pattern, manual activation with arrows/Home/End).
 * Panels must use id `${idPrefix}-panel-${key}` and aria-labelledby `${idPrefix}-tab-${key}`.
 * @param {{ tabs: { key: string, label: React.ReactNode }[], active: string, onChange: (key: string) => void,
 *   idPrefix: string, label: string }} props
 */
export default function Tabs({ tabs, active, onChange, idPrefix, label }) {
  const refs = useRef({})

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
    <div className={styles.scroller}>
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
              {tab.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
