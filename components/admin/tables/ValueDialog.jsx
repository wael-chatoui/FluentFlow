import { useRef } from 'react'
import Modal from '@/components/admin/common/Modal'
import { cx, formatNumber } from '@/components/admin/common/format'
import { prettyValue } from '@/components/admin/tables/tableMeta'
import admin from '@/components/admin/common/admin.module.css'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/admin/tables/tables.module.css'
import { Search } from 'lucide-react'

const TRUNCATION = 500 // utils/api/admin/tables.js TRUNCATE_AT (cut values end with '…')

/**
 * Full (server-truncated) value of a cell, pretty-printed. Bottom sheet on mobile.
 * @param {{ open: boolean, title: string, value: unknown, onClose: () => void, onCopy: (text: string) => void }} props
 */
export default function ValueDialog({ open, title, value, onClose, onCopy }) {
  const closeRef = useRef(null)
  const text = open ? prettyValue(value) : ''
  const raw = open ? (typeof value === 'string' ? value : JSON.stringify(value) || '') : ''
  const truncated = raw.length > TRUNCATION && raw.endsWith('…')

  return (
    <Modal
      open={open}
      title={title}
      icon={Search}
      onClose={onClose}
      initialFocusRef={closeRef}
      actions={
        <>
          <button type="button" className={cx(ui.btn, admin.tap)} onClick={() => onCopy(text)}>
            Copier
          </button>
          <button ref={closeRef} type="button" className={cx(ui.btn, ui.blue, admin.tap)} onClick={onClose}>
            Fermer
          </button>
        </>
      }
    >
      <p className={admin.hint}>
        {formatNumber(raw.length)} caractères
        {truncated && ` · valeur tronquée par le serveur (${TRUNCATION} caractères max).`}
      </p>
      <pre className={styles.valuePre} tabIndex={0} aria-label={`Valeur de ${title}`}>
        {text}
      </pre>
    </Modal>
  )
}
