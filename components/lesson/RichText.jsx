import { Fragment } from 'react'
import styles from '@/components/lesson/RichText.module.css'

// Renders the plain-text fields of a lesson safely (no HTML is ever injected):
//   "\n\n" → paragraphs, "\n" → <br />, "**word**" → highlighted <mark>.
// Stray "**" (unpaired, or a pair cut by an exercise blank) are dropped, never shown raw.

const HIGHLIGHT = /(\*\*[^*\n]+?\*\*)/g

function renderHighlights(line, keyPrefix) {
  return line.split(HIGHLIGHT).map((part, i) => {
    if (!part) return null
    const key = `${keyPrefix}-${i}`
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) {
      return (
        <mark key={key} className={styles.mark}>
          {part.slice(2, -2)}
        </mark>
      )
    }
    return <Fragment key={key}>{part.replace(/\*\*/g, '')}</Fragment>
  })
}

function renderLines(paragraph, keyPrefix) {
  return paragraph.split('\n').map((line, i) => (
    <Fragment key={`${keyPrefix}-${i}`}>
      {i > 0 && <br />}
      {renderHighlights(line, `${keyPrefix}-${i}`)}
    </Fragment>
  ))
}

function asText(text) {
  if (typeof text === 'string') return text
  if (typeof text === 'number') return String(text)
  return ''
}

/**
 * Single-line variant: highlights only, line breaks collapsed into spaces.
 * keepSpaces: keep leading/trailing spaces (a sentence part around an exercise blank).
 */
export function RichTextInline({ text, className, lang, keepSpaces = false }) {
  const collapsed = asText(text).replace(/\s*\n\s*/g, ' ')
  const value = keepSpaces ? collapsed : collapsed.trim()
  if (!value) return null
  return (
    <span className={className} lang={lang}>
      {renderHighlights(value, 'i')}
    </span>
  )
}

/** Multi-line text: paragraphs + line breaks + highlights. */
export default function RichText({ text, className, lang }) {
  const value = asText(text).replace(/\r\n?/g, '\n').trim()
  if (!value) return null
  const paragraphs = value.split(/\n{2,}/)
  return (
    <div className={[styles.rich, className].filter(Boolean).join(' ')} lang={lang}>
      {paragraphs.map((p, i) => (
        <p key={i}>{renderLines(p.trim(), `p${i}`)}</p>
      ))}
    </div>
  )
}
