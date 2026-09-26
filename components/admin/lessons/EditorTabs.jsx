import { useRef } from 'react'
import { cx } from '@/components/admin/common/format'
import styles from '@/components/admin/lessons/editor.module.css'

/**
 * Accessible tab list (arrow keys / Home / End). Panels are rendered by the page
 * with id `${idPrefix}-panel-${value}` and aria-labelledby `${idPrefix}-tab-${value}`.
 * @param {{ tabs: { value, label, icon?, errors?: number, dirty?: boolean, count?: number }[], value, onChange, idPrefix }} props
 */
export default function EditorTabs({ tabs, value, onChange, idPrefix }) {
  const refs = useRef({})

  const focusTab = (index) => {
    const tab = tabs[(index + tabs.length) % tabs.length]
    onChange(tab.value)
    refs.current[tab.value]?.focus()
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
    <div className={styles.tabsScroll}>
      <div role="tablist" aria-label="Sections de la leçon" className={styles.tabs}>
        {tabs.map((tab, i) => {
          const selected = tab.value === value
          return (
            <button
              key={tab.value}
              ref={(el) => {
                refs.current[tab.value] = el
              }}
              type="button"
              role="tab"
              id={`${idPrefix}-tab-${tab.value}`}
              aria-selected={selected}
              aria-controls={`${idPrefix}-panel-${tab.value}`}
              tabIndex={selected ? 0 : -1}
              className={cx(styles.tab, selected && styles.tabActive)}
              onClick={() => onChange(tab.value)}
              onKeyDown={(e) => onKeyDown(e, i)}
            >
              {tab.icon && <span aria-hidden="true">{tab.icon}</span>}
              {tab.label}
              {tab.count !== undefined && <span className={styles.tabCount}>{tab.count}</span>}
              {tab.errors > 0 && (
                <span className={styles.tabErrors}>
                  {tab.errors}
                  <span className="sr-only"> erreur{tab.errors > 1 ? 's' : ''}</span>
                </span>
              )}
              {tab.dirty && !tab.errors && (
                <span className={styles.tabDirty} title="Modifié">
                  <span className="sr-only">(modifié)</span>
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
