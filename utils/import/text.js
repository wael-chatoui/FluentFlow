// Cleanup of text extracted from documents (PDF pages, Google Docs export)
// before it is shown to the teacher and sent to the AI.

export const MAX_IMPORT_TEXT = 150_000
export const MIN_IMPORT_TEXT = 200 // non-space characters below which we warn (likely a scanned PDF)

export const LOW_TEXT_WARNING =
  'Très peu de texte trouvé : ce PDF est peut-être scanné (image). Colle le texte à la main ou utilise un PDF exporté depuis Word/Docs.'

export const countNonSpace = (value) => String(value || '').replace(/\s/g, '').length

// Page numbers alone on a line: "3", "- 3 -", "Page 3", "page 3 sur 10", "3/10", "3 of 10"
const PAGE_NUMBER_RE = /^[-–—\s]*(?:page\s*)?\d{1,4}(?:\s*(?:\/|sur|of|de)\s*\d{1,4})?[-–—\s]*$/i

function normalizeLines(value) {
  return String(value || '')
    .normalize('NFC')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\f/g, '\n') // page breaks
    .replace(/[\u00A0\u2007\u202F]/g, ' ') // non-breaking spaces
    .replace(/[\u200B-\u200D\u2060]/g, '') // zero-width characters
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
}

// Case-insensitive comparison ignoring only a trailing "n/m" page counter ("… 2/4", "… 2 sur 4"),
// so lines are dropped only when identical on most pages
const PAGE_COUNTER_RE = /\s+(?:page\s*)?\d{1,4}\s*(?:\/|sur|of|de)\s*\d{1,4}\s*$/i
const lineKey = (line) => line.toLowerCase().replace(PAGE_COUNTER_RE, '') || line.toLowerCase()

// First and last two non-empty lines of a page (browser prints put the date/title and
// the URL/page counter there). Short lines only: headers/footers are short.
function edgeLines(lines, fromEnd) {
  const nonEmpty = lines.filter(Boolean)
  const edge = fromEnd ? nonEmpty.slice(-2) : nonEmpty.slice(0, 2)
  return edge.filter((line) => line.length <= 160)
}

/**
 * Lines repeated as header or footer on most pages (only when there are 3+ pages).
 * @param {string[][]} pages  lines of each page
 * @returns {Set<string>} keys (see lineKey) to drop
 */
function repeatedEdgeKeys(pages) {
  const keys = new Set()
  if (pages.length < 3) return keys
  const threshold = Math.max(3, Math.ceil(pages.length * 0.6))
  for (const fromEnd of [false, true]) {
    const counts = new Map()
    for (const lines of pages) {
      for (const key of new Set(edgeLines(lines, fromEnd).map(lineKey))) {
        counts.set(key, (counts.get(key) || 0) + 1)
      }
    }
    for (const [key, count] of counts) if (count >= threshold) keys.add(key)
  }
  return keys
}

/**
 * Cleans extracted text: normalizes whitespace, drops page numbers and headers/footers
 * repeated on most pages, collapses blank lines, trims and caps the length.
 * @param {string|string[]} input  whole text, or one string per page
 * @returns {string}
 */
export function cleanImportedText(input) {
  const pages = (Array.isArray(input) ? input : [input]).map(normalizeLines)
  const drop = repeatedEdgeKeys(pages)
  const multiPage = pages.length > 1

  const text = pages
    .map((lines) => {
      const edges = new Set([...edgeLines(lines, false), ...edgeLines(lines, true)])
      return lines
        .filter((line) => {
          if (!line) return true
          if (multiPage && edges.has(line) && PAGE_NUMBER_RE.test(line)) return false
          return !(edges.has(line) && drop.has(lineKey(line)))
        })
        .join('\n')
    })
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return text.length > MAX_IMPORT_TEXT ? text.slice(0, MAX_IMPORT_TEXT).trim() : text
}

/** French warning when the text is too short to be a real lesson document, else null. */
export function lowTextWarning(text) {
  return countNonSpace(text) < MIN_IMPORT_TEXT ? LOW_TEXT_WARNING : null
}

/**
 * Cleans a file name / document title: basename only, no control characters,
 * single spaces, at most 200 characters.
 */
export function sanitizeSourceName(value, fallback = '') {
  const s = String(value || '')
    .normalize('NFC')
    .split(/[/\\]/)
    .pop()
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F<>"]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
    .trim()
  return s || fallback
}
