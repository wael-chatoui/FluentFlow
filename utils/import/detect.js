// Hints read from an imported document: lesson date and default title, from the
// file name ("Rebecca_L07_Vouloir-Vocab.pdf"), the Google Doc title or the first
// lines of the text. Pure: used by the import page, tested in tests/import.test.js.
import { IMPORT_LIMITS } from '@/utils/import/limits'

// ---- Text folding (keeps string length so match positions stay valid) ----

/** Lowercase without accents, same length as the input ("Déc" → "dec"). */
function fold(value) {
  return Array.from(String(value || ''), (c) => {
    const base = c.normalize('NFD').slice(0, c.length)
    const lower = base.toLowerCase()
    return lower.length === c.length ? lower : c
  }).join('')
}

// ---- Dates ----

const MONTHS = {
  janvier: 1, janv: 1, january: 1, jan: 1,
  fevrier: 2, fevr: 2, fev: 2, february: 2, feb: 2,
  mars: 3, march: 3, mar: 3,
  avril: 4, avr: 4, april: 4, apr: 4,
  mai: 5, may: 5,
  juin: 6, june: 6, jun: 6,
  juillet: 7, juil: 7, july: 7, jul: 7,
  aout: 8, august: 8, aug: 8,
  septembre: 9, september: 9, sept: 9, sep: 9,
  octobre: 10, october: 10, oct: 10,
  novembre: 11, november: 11, nov: 11,
  decembre: 12, december: 12, dec: 12,
}
// Longest names first so "mars" wins over "mar"
const MONTH_ALT = Object.keys(MONTHS)
  .sort((a, b) => b.length - a.length)
  .join('|')

// Each pattern: regex on folded text + how to read { day, month, year } from the match.
// The leading group (start, or a character that is neither a letter nor a digit, so
// "L07" never starts a date) replaces a lookbehind, which older Safari cannot parse.
const DATE_PATTERNS = [
  {
    // 2025-03-12, 2025_03_12, 2025.03.12, 2025/03/12
    re: /(^|[^a-z\d])(\d{4})([-/._])(\d{1,2})\3(\d{1,2})(?!\d)/g,
    read: (m) => ({ year: m[2], month: m[4], day: m[5] }),
  },
  {
    // 12/03/2025, 12-03-2025, 12.03.2025, 12_03_2025 (French order: day first)
    re: /(^|[^a-z\d])(\d{1,2})([-/._])(\d{1,2})\3(\d{4})(?!\d)/g,
    read: (m) => ({ day: m[2], month: m[4], year: m[5] }),
  },
  {
    // 12/03/25
    re: /(^|[^a-z\d])(\d{1,2})\/(\d{1,2})\/(\d{2})(?![\d/])/g,
    read: (m) => ({ day: m[2], month: m[3], year: `20${m[4]}` }),
  },
  {
    // 12 mars 2025, 1er mars 2025, 12 March 2025, 12-mars-2025
    re: new RegExp(`(^|[^a-z\\d])(\\d{1,2})(?:er|st|nd|rd|th)?[\\s_.-]*(${MONTH_ALT})\\.?[\\s_.,-]+(\\d{4})(?!\\d)`, 'g'),
    read: (m) => ({ day: m[2], month: MONTHS[m[3]], year: m[4] }),
  },
  {
    // March 12, 2025 · Mar 12 2025
    re: new RegExp(`(^|[^a-z])(${MONTH_ALT})\\.?[\\s_-]+(\\d{1,2})(?:st|nd|rd|th)?,?[\\s_-]+(\\d{4})(?!\\d)`, 'g'),
    read: (m) => ({ month: MONTHS[m[2]], day: m[3], year: m[4] }),
  },
]

const pad = (n) => String(n).padStart(2, '0')

function localYmd(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// Real calendar date, not before 2000 and not after `latest` ('YYYY-MM-DD')
function validYmd({ day, month, year }, latest) {
  const d = Number(day)
  const m = Number(month)
  const y = Number(year)
  if (!Number.isInteger(d) || !Number.isInteger(m) || !Number.isInteger(y) || y < 2000) return null
  const date = new Date(y, m - 1, d)
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null
  const ymd = `${y}-${pad(m)}-${pad(d)}`
  return ymd <= latest ? ymd : null
}

/**
 * First plausible date written in `value`.
 * @param {string} value
 * @param {{ today?: Date }} [options]  dates after `today` are ignored (imports are past lessons)
 * @returns {{ date: string, start: number, end: number } | null}  `date` is 'YYYY-MM-DD';
 *   start / end locate the date in `value`
 */
export function findDate(value, { today = new Date() } = {}) {
  const text = fold(value)
  if (!text) return null
  const latest = localYmd(today)
  const found = []
  for (const { re, read } of DATE_PATTERNS) {
    for (const m of text.matchAll(re)) {
      const date = validYmd(read(m), latest)
      if (!date) continue
      const start = m.index + m[1].length
      found.push({ date, start, end: m.index + m[0].length })
    }
  }
  found.sort((a, b) => a.start - b.start)
  return found[0] || null
}

const HEAD_LINES = 15
const HEAD_CHARS = 1200

/** The first non-empty lines of a text (where a recap usually states its date). */
function headOf(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, HEAD_LINES)
    .join('\n')
    .slice(0, HEAD_CHARS)
}

/**
 * Lesson date of an imported document: from its name (file name or Google Doc
 * title) first, then from the first lines of its text.
 * @param {{ name?: string, text?: string }} source
 * @param {{ today?: Date }} [options]
 * @returns {{ date: string, from: 'name'|'text' } | null}
 */
export function detectLessonDate({ name, text } = {}, options) {
  const inName = findDate(name, options)
  if (inName) return { date: inName.date, from: 'name' }
  const inText = findDate(headOf(text), options)
  return inText ? { date: inText.date, from: 'text' } : null
}

// ---- Titles ----

/** Letters and digits only, lowercase, no accents: compares names loosely. */
function normalizeName(text) {
  return fold(text).replace(/[^a-z0-9]/g, '')
}

/** Ways the student's name can appear in a file name (full name, first name, email). */
function studentNames(student) {
  const out = new Set()
  const full = student?.full_name?.trim()
  if (full) {
    out.add(normalizeName(full))
    full.split(/\s+/).forEach((part) => {
      if (part.length >= 3) out.add(normalizeName(part))
    })
  }
  const local = student?.email?.split('@')[0]
  if (local) {
    out.add(normalizeName(local))
    out.add(normalizeName(local.split(/[._-]/)[0]))
  }
  out.delete('')
  return out
}

// "L07", "L 7", "Leçon 7", "Lesson 7", and a second lesson: "L02_L03", "L2-L3"
const LESSON_NUMBER_RE =
  /(^|[\s_.-])(?:le[cç]ons?|lessons?|l)[\s_-]?0*(\d{1,3})(?:[\s_-]+(?:le[cç]ons?|lessons?|l)[\s_-]?0*(\d{1,3}))?(?=$|[\s_.-])/i

// Names that say nothing about the content: better let the AI propose a title
const GENERIC_TITLES = new Set([
  'bilan', 'bilandecours', 'bilanducours', 'bilandelecon', 'recap', 'recapitulatif', 'resume', 'resumeducours',
  'cours', 'coursdefrancais', 'lecon', 'lesson', 'lessonnotes', 'lessonrecap', 'frenchlesson', 'notes',
  'notesdecours', 'document', 'sanstitre', 'untitled', 'untitleddocument', 'documentsanstitre', 'compterendu',
  'cr', 'fiche', 'support', 'devoirs', 'homework',
  // Fallback names of the import itself (link label, Doc / file without a name)
  'googledoc', 'googledocs', 'fichierdrive', 'fichiergoogledrive', 'documentpdf', 'documenttexte',
])

const EXTENSION_RE = /\.(pdf|docx?|odt|rtf|txt|md|markdown)$/i
const COPY_PREFIX_RE = /^(?:copie de|copy of)\s+/i
const EDGE_JUNK_RE = /^[\s_.,;:–—-]+|[\s_.,;:–—-]+$/g
const DANGLING_WORD_RE = /\s+(?:du|de|le|la|des|of|on|from|the)$/i

// The removed part becomes a space so the words around it stay apart
function removeRange(value, start, end) {
  return `${value.slice(0, start)} ${value.slice(end)}`.trim()
}

// "Vouloir-Vocab" → "Vouloir vocab": slug words after the first lose their capital
// (ALLCAPS such as "COD" and mixed case such as "iPhone" are kept)
function sentenceCase(words) {
  return words
    .map((word, i) => {
      if (i === 0) return word.charAt(0).toUpperCase() + word.slice(1)
      return /^\p{Lu}\p{Ll}+$/u.test(word) ? word.toLowerCase() : word
    })
    .join(' ')
}

/**
 * Default lesson title from a file / document name, and the lesson number(s) it
 * carries: "Rebecca_L07_Vouloir-Vocab.pdf" (student Rebecca) → "Leçon 7 — Vouloir vocab".
 * The student's name, dates, the extension and generic words ("Bilan") are dropped;
 * an empty title lets the AI propose one.
 * @param {string} sourceName
 * @param {{ full_name?: string, email?: string } | null} [student]
 * @param {{ today?: Date }} [options]
 * @returns {{ title: string, lessonNumber: number | null }}
 */
export function titleFromName(sourceName, student, options) {
  let base = String(sourceName || '')
    .trim()
    .replace(EXTENSION_RE, '')
    .replace(COPY_PREFIX_RE, '')
  if (!base) return { title: '', lessonNumber: null }
  // Slugs ("Vouloir-Vocab", "passe_compose") use _ and - as spaces
  const slug = !/\s/.test(base)

  const names = studentNames(student)
  const prefix = /^([^_]+)_(.+)$/.exec(base) || /^(.+?)\s+[-–—]\s+(.+)$/.exec(base)
  if (prefix && names.has(normalizeName(prefix[1]))) base = prefix[2]

  let lessonNumber = null
  let label = ''
  const lesson = LESSON_NUMBER_RE.exec(base)
  if (lesson) {
    const first = Number(lesson[2])
    const second = lesson[3] !== undefined ? Number(lesson[3]) : null
    lessonNumber = first
    label = second !== null && second !== first ? `Leçons ${first} et ${second}` : `Leçon ${first}`
    const start = lesson.index + lesson[1].length
    base = removeRange(base, start, lesson.index + lesson[0].length)
  }

  const date = findDate(base, options)
  if (date) base = removeRange(base, date.start, date.end).replace(DANGLING_WORD_RE, '')
  const words = base
    .split(slug ? /[\s_-]+/ : /[\s_]+/)
    .map((w) => w.trim())
    .filter((w) => w && !names.has(normalizeName(w)))
  let rest = (slug ? sentenceCase(words) : words.join(' ')).replace(EDGE_JUNK_RE, '').replace(DANGLING_WORD_RE, '')
  if (GENERIC_TITLES.has(normalizeName(rest))) rest = ''

  const title = label && rest ? `${label} — ${rest}` : label || rest
  return { title: title.slice(0, IMPORT_LIMITS.maxTitle).trim(), lessonNumber }
}
