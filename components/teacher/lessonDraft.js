// localStorage drafts for the "new lesson" form, one per student, so a pasted
// transcript is never lost (tab closed, crash, network error…).
// Every access is wrapped in try/catch: storage can be disabled or full.

const PREFIX = 'lessonDraft:'
export const UNASSIGNED = 'unassigned'

export function draftKey(studentId) {
  return `${PREFIX}${studentId || UNASSIGNED}`
}

export function hasDraftContent(draft) {
  return Boolean(draft && (draft.title?.trim() || draft.transcript?.trim() || draft.canva?.trim()))
}

/** @returns {{ title: string, transcript: string, canva: string, lessonDate: string, savedAt: number } | null} */
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
      savedAt: typeof d.savedAt === 'number' ? d.savedAt : 0,
    }
    return hasDraftContent(draft) ? draft : null
  } catch {
    return null
  }
}

/** Saves (or removes, when empty) the draft. Returns the saved timestamp, 0 if removed, null if storage failed. */
export function writeDraft(studentId, { title, transcript, canva, lessonDate }) {
  try {
    if (!hasDraftContent({ title, transcript, canva })) {
      window.localStorage.removeItem(draftKey(studentId))
      return 0
    }
    const savedAt = Date.now()
    window.localStorage.setItem(
      draftKey(studentId),
      JSON.stringify({ title, transcript, canva, lessonDate, savedAt })
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
