// localStorage drafts for the "new lesson" form, one per student, so a pasted
// transcript is never lost (tab closed, crash, network error…), plus the teacher's
// small preferences (last student, "review before publishing").
// Every access is wrapped in try/catch: storage can be disabled or full.

const PREFIX = 'lessonDraft:'
const PREF_PREFIX = 'teacher.'
export const UNASSIGNED = 'unassigned'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function draftKey(studentId) {
  return `${PREFIX}${studentId || UNASSIGNED}`
}

/**
 * Random uuid identifying one lesson request: the API returns the lesson already
 * created with this key instead of a duplicate. crypto.randomUUID only exists in
 * secure contexts (not on http://<LAN IP>), so fall back to getRandomValues.
 */
export function newClientKey() {
  const c = globalThis.crypto
  if (typeof c?.randomUUID === 'function') return c.randomUUID()
  const b = c.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function hasDraftContent(draft) {
  return Boolean(draft && (draft.title?.trim() || draft.transcript?.trim() || draft.canva?.trim()))
}

/**
 * The form's student does not exist (deleted account, stale ?student= link or preference):
 * where its text goes, without losing the unassigned draft (a ?student= link skips it).
 * @param {object} form  the form loaded for the missing student
 * @param {object | null} unassigned  readDraft('')
 * @returns {'restore'|'conflict'|'move'|'reset'}
 *   restore: empty form → show the unassigned draft; conflict: both hold text → the teacher
 *   chooses; move: the text becomes the unassigned draft; reset: nothing to keep
 */
export function missingStudentAction(form, unassigned) {
  if (!hasDraftContent(form)) return unassigned ? 'restore' : 'reset'
  return unassigned ? 'conflict' : 'move'
}

function readOptions(o) {
  if (!o || typeof o !== 'object') return null
  if (typeof o.count !== 'string' || !Array.isArray(o.types) || typeof o.instructions !== 'string') return null
  const options = { count: o.count, types: o.types.filter((t) => typeof t === 'string'), instructions: o.instructions }
  // « Laisser l'IA choisir » (absent from drafts saved before it existed)
  if (typeof o.auto === 'boolean') options.auto = o.auto
  return options
}

/**
 * @returns {{ title: string, transcript: string, canva: string, lessonDate: string, clientKey: string,
 *   options: { count: string, types: string[], instructions: string, auto?: boolean } | null,
 *   submittedAt: number, savedAt: number } | null}
 *   `submittedAt` > 0: the draft was already sent once (the lesson may exist).
 */
export function readDraft(studentId) {
  try {
    const raw = window.localStorage.getItem(draftKey(studentId))
    if (!raw) return null
    const d = JSON.parse(raw)
    if (!d || typeof d !== 'object') return null
    const draft = {
      title: typeof d.title === 'string' ? d.title : '',
      transcript: typeof d.transcript === 'string' ? d.transcript : '',
      canva: typeof d.canva === 'string' ? d.canva : '',
      lessonDate: typeof d.lessonDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.lessonDate) ? d.lessonDate : '',
      clientKey: typeof d.clientKey === 'string' && UUID_RE.test(d.clientKey) ? d.clientKey : '',
      options: readOptions(d.options),
      submittedAt: typeof d.submittedAt === 'number' ? d.submittedAt : 0,
      savedAt: typeof d.savedAt === 'number' ? d.savedAt : 0,
    }
    return hasDraftContent(draft) ? draft : null
  } catch {
    return null
  }
}

/** Saves (or removes, when empty) the draft. Returns the saved timestamp, 0 if removed, null if storage failed. */
export function writeDraft(studentId, { title, transcript, canva, lessonDate, clientKey, options, submittedAt }) {
  try {
    if (!hasDraftContent({ title, transcript, canva })) {
      window.localStorage.removeItem(draftKey(studentId))
      return 0
    }
    const savedAt = Date.now()
    window.localStorage.setItem(
      draftKey(studentId),
      JSON.stringify({
        title,
        transcript,
        canva,
        lessonDate,
        clientKey,
        options: options || null,
        submittedAt: submittedAt || 0,
        savedAt,
      })
    )
    return savedAt
  } catch {
    return null
  }
}

export function removeDraft(studentId) {
  try {
    window.localStorage.removeItem(draftKey(studentId))
  } catch {
    // ignore
  }
}

/** Teacher preference ('lastStudent', 'reviewBeforePublish'…): string or null. */
export function readPref(name) {
  try {
    return window.localStorage.getItem(`${PREF_PREFIX}${name}`)
  } catch {
    return null
  }
}

/** Saves a preference; null removes it. */
export function writePref(name, value) {
  try {
    if (value === null || value === undefined) window.localStorage.removeItem(`${PREF_PREFIX}${name}`)
    else window.localStorage.setItem(`${PREF_PREFIX}${name}`, String(value))
  } catch {
    // ignore
  }
}
