// Google Docs / Drive link parser shared by the import page (instant feedback when a
// link is pasted) and /api/teacher/import/resolve (which rebuilds the download URL
// from the parsed id). Pure: safe in the browser and on the server.
import { IMPORT_LIMITS } from '@/utils/import/limits'

export const LINK_MESSAGES = {
  empty: 'Colle un lien Google Docs ou Google Drive.',
  invalid:
    'Lien invalide : colle un lien Google Docs (https://docs.google.com/document/d/…) ou Google Drive (https://drive.google.com/file/d/…).',
  host: 'Seuls les liens Google Docs (docs.google.com) ou Google Drive (drive.google.com) sont acceptés.',
  unsupported: 'Seuls les Google Docs et les PDF sont pris en charge (pas Sheets, Slides ni Forms).',
  folderNotPublic:
    'Impossible d’accéder à ce dossier Drive : il doit être partagé en « Tous les utilisateurs disposant du lien » (Partager → Accès général).',
  page: 'Ce lien ouvre une page de Google Drive, pas un document : ouvre le document puis copie son lien (Partager → Copier le lien).',
  published:
    'Les liens « Publié sur le Web » ne sont pas pris en charge : utilise le lien de partage du document (Partager → Copier le lien).',
}

const ID_RE = /^[A-Za-z0-9_-]{10,200}$/
const RESOURCE_KEY_RE = /^[A-Za-z0-9_-]{1,200}$/

// Optional "/u/<n>" account segment Google adds to some links
const DOC_PATH_RE = /^\/document(?:\/u\/\d+)?\/d\/([^/]+)(?:\/.*)?$/
const DOC_PUBLISHED_RE = /^\/document(?:\/u\/\d+)?\/d\/e\//
const DOC_HOME_RE = /^\/document(?:\/u\/\d+)?\/?$/
const FILE_PATH_RE = /^\/file(?:\/u\/\d+)?\/d\/([^/]+)(?:\/.*)?$/
const FOLDER_PATH_RE = /^\/drive(?:\/u\/\d+)?\/folders\/([^/?]+)(?:\/.*)?$/
const FOLDER_VIEW_RE = /^\/(?:folderview|embeddedfolderview)\/?$/
const OPEN_PATH_RE = /^(?:\/u\/\d+)?\/(?:open|uc)\/?$/
// Google files that are not Docs (Sheets, Slides, Forms, Drawings…)
const OTHER_DOCS_RE = /^\/(?:spreadsheets|presentation|forms|drawings)(?:\/|$)/
const DRIVE_PAGE_RE = /^\/drive(?:\/|$)/

const LABELS = { doc: 'Google Doc', drive: 'Fichier Google Drive', folder: 'Dossier Google Drive' }

function toUrl(value) {
  // Pasted from a chat: may be wrapped in <…>, quotes or guillemets
  const s = value.replace(/^[\s<"'«]+|[\s>"'»]+$/g, '')
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(s)?.[1]?.toLowerCase()
  if (scheme && scheme !== 'http' && scheme !== 'https') return null
  try {
    const url = new URL(scheme ? s : `https://${s}`)
    // Google serves everything over https: upgrade plain-http links
    if (url.protocol === 'http:') url.protocol = 'https:'
    return url
  } catch {
    return null
  }
}

/** { kind, id } found in the URL, or an error key of LINK_MESSAGES. */
function locate(url) {
  const path = url.pathname
  const queryId = url.searchParams.get('id')

  if (url.hostname === 'docs.google.com') {
    if (DOC_PUBLISHED_RE.test(path)) return { error: 'published' }
    const doc = DOC_PATH_RE.exec(path)
    if (doc) return { kind: 'doc', id: doc[1] }
    if (OTHER_DOCS_RE.test(path)) return { error: 'unsupported' }
    // Old "docs.google.com/open?id=" links can point to any Drive file
    if (OPEN_PATH_RE.test(path) && queryId) return { kind: 'drive', id: queryId }
    if (DOC_HOME_RE.test(path)) return { error: 'page' }
    return { error: 'invalid' }
  }

  if (url.hostname === 'drive.google.com') {
    const file = FILE_PATH_RE.exec(path)
    if (file) return { kind: 'drive', id: file[1] }
    const folder = FOLDER_PATH_RE.exec(path)
    if (folder) return { kind: 'folder', id: folder[1] }
    if (FOLDER_VIEW_RE.test(path) && queryId) return { kind: 'folder', id: queryId }
    if (OPEN_PATH_RE.test(path) && queryId) return { kind: 'drive', id: queryId }
    if (DRIVE_PAGE_RE.test(path)) return { error: 'page' }
    return { error: 'invalid' }
  }

  return { error: 'host' }
}

/**
 * Parses a pasted Google Docs / Drive link.
 * @param {unknown} input
 * @returns {{ kind: 'doc'|'drive'|'folder', id: string, resourceKey: string|null, url: string,
 *   dedupeKey: string, label: string } | { error: string }}
 *   `url` is a canonical https link rebuilt from the id; `error` is a French message.
 */
export function parseGoogleLink(input) {
  const value = typeof input === 'string' ? input.trim() : ''
  if (!value) return { error: LINK_MESSAGES.empty }
  if (value.length > IMPORT_LIMITS.maxLinkLength) return { error: LINK_MESSAGES.invalid }

  const url = toUrl(value)
  if (!url || url.username || url.password || url.port) return { error: LINK_MESSAGES.invalid }

  const found = locate(url)
  if (found.error) return { error: LINK_MESSAGES[found.error] }
  if (!ID_RE.test(found.id)) return { error: LINK_MESSAGES.invalid }

  const { kind, id } = found
  const key = url.searchParams.get('resourcekey')
  // Files shared before Google's 2021 security update need their resource key
  const resourceKey = key && RESOURCE_KEY_RE.test(key) ? key : null
  const base =
    kind === 'doc'
      ? `https://docs.google.com/document/d/${id}/edit`
      : kind === 'folder'
      ? `https://drive.google.com/drive/folders/${id}`
      : `https://drive.google.com/file/d/${id}/view`
  return {
    kind,
    id,
    resourceKey,
    url: resourceKey ? `${base}?resourcekey=${resourceKey}` : base,
    dedupeKey: `google:${id}`,
    label: LABELS[kind],
  }
}

const URL_SCAN_RE = /(?:https?:\/\/|(?:docs|drive)\.google\.com\/)[^\s<>"'«»,;]+/gi

/**
 * Extracts all Google Docs / Drive / Folder links from a pasted text block
 * (supports single URL, multiple URLs separated by newlines/spaces, or embedded in text).
 * @param {string} input
 * @returns {{ links: Array<object>, folders: Array<object>, duplicates: number, errors: string[] }}
 */
export function extractGoogleLinks(input) {
  const text = typeof input === 'string' ? input.trim() : ''
  if (!text) return { links: [], folders: [], duplicates: 0, errors: [LINK_MESSAGES.empty] }

  // 1. Scan for URLs using regex
  const rawMatches = text.match(URL_SCAN_RE) || []
  const candidates = rawMatches.length ? rawMatches : text.split(/[\r\n,;]+/).map((s) => s.trim()).filter(Boolean)

  const links = []
  const folders = []
  const errors = []
  const seen = new Set()
  let duplicates = 0

  candidates.forEach((cand) => {
    const parsed = parseGoogleLink(cand)
    if (parsed.error) {
      if (!errors.includes(parsed.error)) errors.push(parsed.error)
      return
    }
    if (seen.has(parsed.dedupeKey)) {
      duplicates += 1
      return
    }
    seen.add(parsed.dedupeKey)
    if (parsed.kind === 'folder') {
      folders.push(parsed)
    } else {
      links.push(parsed)
    }
  })

  return { links, folders, duplicates, errors }
}

