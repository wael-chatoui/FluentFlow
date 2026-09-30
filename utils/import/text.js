// Cleanup of text extracted from documents (PDF pages, Google Docs export, text
// files) before it is shown to the teacher and sent to the AI. Pure: also used in
// the browser for .txt / .md files.
import { IMPORT_LIMITS } from '@/utils/import/limits'

const LOW_TEXT_WARNING =
  'Très peu de texte trouvé : ce PDF est peut-être scanné (image). Colle le texte à la main ou utilise un PDF exporté depuis Word/Docs.'

const LOW_TEXT_CHARS = 200 // non-space characters below which we warn
const EMPTY_PAGE_CHARS = 20 // a page with fewer non-space characters counts as "without text"
const MAX_EDGE_LINE = 160 // headers / footers are short

const countNonSpace = (value) => String(value || '').replace(/\s/g, '').length

// A page number alone on a line: "3", "- 3 -", "Page 3", "page 3 sur 10", "3/10", "3 of 10".
// Not "2024" (4 digits) nor "12/03" (a date: first number above the second).
const PAGE_NUMBER_RE = /^[-–—\s]*(?:page\s*)?(\d{1,3})(?:\s*(?:\/|sur|of|de)\s*(\d{1,3}))?[-–—\s]*$/i

function isPageNumber(line) {
  const m = PAGE_NUMBER_RE.exec(line)
  return Boolean(m) && (m[2] === undefined || Number(m[1]) <= Number(m[2]))
}

// Browser print headers / footers carry a date, a time, a URL or a page counter.
// Lines without any of these (e.g. a "Vocabulaire" heading at the top of every
// page) are kept even when repeated: dropping real content is worse than a
// repeated title the AI will ignore.
const CHROME_RE = /\d|https?:\/\/|www\.|\.[a-z]{2,}\/|©/i

// Case-insensitive comparison ignoring a trailing "n/m" page counter ("… 2/4", "… 2 sur 4")
const PAGE_COUNTER_RE = /\s+(?:page\s*)?\d{1,3}\s*(?:\/|sur|of|de)\s*\d{1,3}\s*$/i
const lineKey = (line) => line.toLowerCase().replace(PAGE_COUNTER_RE, '') || line.toLowerCase()

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

// Index of the first (or last) non-empty line not dropped yet, -1 if none
function edgeIndex(lines, dropped, fromEnd) {
  if (fromEnd) {
    for (let i = lines.length - 1; i >= 0; i -= 1) if (lines[i] && !dropped.has(i)) return i
  } else {
    for (let i = 0; i < lines.length; i += 1) if (lines[i] && !dropped.has(i)) return i
  }
  return -1
}

/**
 * Indexes of header / footer lines to drop on each page. Works by position: only
 * the current first / last line of a page can go, in up to two passes (headers are
 * sometimes split on two lines). A line goes when it is a page number (first pass,
 * multi-page documents) or when the same chrome-like line sits at the same edge of
 * at least 60 % of the pages (3+ pages).
 * @param {string[][]} pages  lines of each page
 * @returns {Set<number>[]}
 */
function edgeLinesToDrop(pages) {
  const dropped = pages.map(() => new Set())
  if (pages.length < 2) return dropped
  const threshold = Math.max(3, Math.ceil(pages.length * 0.6))

  for (let pass = 0; pass < 2; pass += 1) {
    for (const fromEnd of [false, true]) {
      const edges = pages.map((lines, p) => edgeIndex(lines, dropped[p], fromEnd))
      const counts = new Map()
      edges.forEach((i, p) => {
        const line = i >= 0 ? pages[p][i] : ''
        if (!line || line.length > MAX_EDGE_LINE || !CHROME_RE.test(line)) return
        const key = lineKey(line)
        counts.set(key, (counts.get(key) || 0) + 1)
      })
      edges.forEach((i, p) => {
        if (i < 0) return
        const line = pages[p][i]
        const repeated = pages.length >= 3 && (counts.get(lineKey(line)) || 0) >= threshold && CHROME_RE.test(line)
        if (repeated || (pass === 0 && isPageNumber(line))) dropped[p].add(i)
      })
    }
  }
  return dropped
}

/**
 * Cleans extracted text: normalizes whitespace, drops page numbers and the
 * headers / footers repeated on most pages, collapses blank lines and trims.
 * @param {string|string[]} input  whole text, or one string per page
 * @returns {string}
 */
export function cleanImportedText(input) {
  const pages = (Array.isArray(input) ? input : [input]).map(normalizeLines)
  const dropped = edgeLinesToDrop(pages)
  return pages
    .map((lines, p) => lines.filter((_, i) => !dropped[p].has(i)).join('\n'))
    .join('\n\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function scanWarning(pages, text, lowText) {
  if (countNonSpace(text) < LOW_TEXT_CHARS) return lowText
  if (pages.length < 2) return null
  const empty = pages.filter((page) => countNonSpace(page) < EMPTY_PAGE_CHARS).length
  if (empty * 2 <= pages.length) return null
  return `Beaucoup de pages sans texte (${empty} sur ${pages.length}) : ce PDF est peut-être en partie scanné. Vérifie le texte et complète-le à la main si besoin.`
}

/**
 * Cleaned text ready for the import, capped at the import limit, plus a French
 * warning when it was truncated or looks like a scan (little text, or more than
 * half of the pages without text).
 * @param {string|string[]} input  whole text, or one string per page (PDF)
 * @param {{ lowText?: string }} [options]  warning used when there is almost no text
 * @returns {{ text: string, warning: string|null }}
 */
export function prepareImportText(input, { lowText = LOW_TEXT_WARNING } = {}) {
  const pages = Array.isArray(input) ? input : [input]
  const cleaned = cleanImportedText(pages)
  const { maxText } = IMPORT_LIMITS
  const truncated = cleaned.length > maxText
  const text = truncated ? cleaned.slice(0, maxText).trim() : cleaned
  const warnings = []
  const scan = scanWarning(pages, text, lowText)
  if (scan) warnings.push(scan)
  if (truncated) {
    warnings.push(
      `Document tronqué : seuls les ${maxText.toLocaleString('fr-FR')} premiers caractères sont gardés, la fin est ignorée.`
    )
  }
  return { text, warning: warnings.length ? warnings.join(' ') : null }
}

/**
 * Cleans a file name / document title: basename only, no control characters,
 * single spaces, at most IMPORT_LIMITS.maxSourceName characters.
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
    .slice(0, IMPORT_LIMITS.maxSourceName)
    .trim()
  return s || fallback
}
