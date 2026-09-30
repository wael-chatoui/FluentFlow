import { useCallback, useEffect, useRef, useState } from 'react'
import { draftOptions } from '@/components/teacher/lessons/OptionsDisclosure'
import {
  hasDraftContent,
  missingStudentAction,
  newClientKey,
  readDraft,
  readPref,
  removeDraft,
  writeDraft,
  writePref,
} from '@/components/teacher/lessonDraft'
import { isValidId, todayLocal } from '@/components/teacher/format'
import { useMountedRef } from '@/components/teacher/hooks'

const SAVE_DELAY = 600
const LAST_STUDENT_PREF = 'lastStudent'

// A restored draft keeps its own lesson date (the teacher may paste in the evening and
// generate the next morning); the page says so.
function formFromDraft(studentId, draft) {
  return {
    studentId,
    lessonDate: draft?.lessonDate || todayLocal(),
    title: draft?.title || '',
    transcript: draft?.transcript || '',
    canva: draft?.canva || '',
    clientKey: draft?.clientKey || newClientKey(),
    options: draftOptions(draft?.options),
    submittedAt: draft?.submittedAt || 0,
  }
}

function signatureOf(f) {
  return JSON.stringify([f.studentId, f.lessonDate, f.title, f.transcript, f.canva, f.clientKey, f.options, f.submittedAt])
}

const restoredFrom = (draft) => ({ savedAt: draft.savedAt || Date.now(), submittedAt: draft.submittedAt })

/**
 * State of the "new lesson" form, auto-saved as a per-student localStorage draft.
 * Initial student: ?student=, else the unassigned draft, else the last student chosen.
 * Each draft carries the `clientKey` of its lesson request and `submittedAt` once sent.
 * @param {{ ready: boolean, queryStudent: string | undefined, students: object[] | null, paused: boolean }} params
 *   paused: stop saving (the form was sent and the page is leaving)
 */
export default function useLessonDraft({ ready, queryStudent, students, paused }) {
  const mounted = useMountedRef()
  const [form, setForm] = useState(null) // null until the router is ready (localStorage is client-only)
  const formRef = useRef(form)
  formRef.current = form
  const studentSource = useRef('') // 'query' | 'pref' | ''
  const checkedStudent = useRef(false)
  const [missingStudent, setMissingStudent] = useState(false)
  const [restored, setRestored] = useState(null) // { savedAt, submittedAt }
  const [conflict, setConflict] = useState(null) // { draft, fromId }
  const [savedAt, setSavedAt] = useState(null)
  const [storageFailed, setStorageFailed] = useState(false)
  const saveTimer = useRef(null)
  const lastSaved = useRef('')

  useEffect(() => {
    if (!ready || formRef.current) return
    let studentId = isValidId(queryStudent) ? queryStudent : ''
    studentSource.current = studentId ? 'query' : ''
    if (!studentId && !readDraft('')) {
      const last = readPref(LAST_STUDENT_PREF)
      if (isValidId(last)) {
        studentId = last
        studentSource.current = 'pref'
      }
    }
    const draft = readDraft(studentId)
    const initial = formFromDraft(studentId, draft)
    lastSaved.current = draft ? signatureOf(initial) : ''
    setForm(initial)
    if (draft) {
      setRestored(restoredFrom(draft))
      setSavedAt(draft.savedAt || null)
    }
  }, [ready, queryStudent])

  // The initial student must exist (deleted account, stale link or preference)
  useEffect(() => {
    if (!students || !form || checkedStudent.current) return
    checkedStudent.current = true
    if (!form.studentId || students.some((s) => s.id === form.studentId)) return
    if (studentSource.current === 'query') setMissingStudent(true)
    else writePref(LAST_STUDENT_PREF, null)
    const missingId = form.studentId
    // The form moves to "no student": its autosave must never overwrite (or, when the form
    // is empty, remove) the unassigned draft that a ?student= link did not load
    const unassigned = readDraft('')
    const action = missingStudentAction(form, unassigned)
    if (action === 'conflict') {
      // As when switching students: the missing student's text stays under its key until
      // the teacher chooses
      setForm((f) => ({ ...f, studentId: '', submittedAt: 0 }))
      setRestored(null)
      setConflict({ draft: unassigned, fromId: missingId })
      return
    }
    removeDraft(missingId)
    if (action === 'restore') {
      const next = formFromDraft('', unassigned)
      lastSaved.current = signatureOf(next)
      setForm(next)
      setRestored(restoredFrom(unassigned))
      setSavedAt(unassigned.savedAt || null)
      return
    }
    // move: the text is re-saved as the unassigned draft by the autosave; reset: nothing to save
    setForm((f) => ({ ...f, studentId: '' }))
  }, [students, form])

  const flush = useCallback(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = null
    const f = formRef.current
    if (!f) return
    const signature = signatureOf(f)
    if (signature === lastSaved.current) return
    const result = writeDraft(f.studentId, f)
    lastSaved.current = result === null ? '' : signature
    if (!mounted.current) return
    setStorageFailed(result === null)
    if (result !== null) setSavedAt(result || null)
  }, [mounted])

  // Debounced autosave; paused while a draft conflict is pending, so the other
  // student's draft is not overwritten before the teacher chooses
  useEffect(() => {
    clearTimeout(saveTimer.current)
    saveTimer.current = null
    if (!form || paused || conflict) return undefined
    saveTimer.current = setTimeout(flush, SAVE_DELAY)
    return undefined
  }, [form, paused, flush, conflict])

  // A pending save is written when leaving (unmount, tab hidden or closed)
  useEffect(() => {
    const flushPending = () => {
      if (!saveTimer.current) return
      clearTimeout(saveTimer.current)
      saveTimer.current = null
      if (formRef.current) writeDraft(formRef.current.studentId, formRef.current)
    }
    window.addEventListener('pagehide', flushPending)
    return () => {
      window.removeEventListener('pagehide', flushPending)
      flushPending()
    }
  }, [])

  /** Merges a patch (object or (form) => object) into the form. */
  const update = useCallback((patch) => {
    setForm((f) => ({ ...f, ...(typeof patch === 'function' ? patch(f) : patch) }))
  }, [])

  const changeStudent = (newId) => {
    const current = formRef.current
    if (!current || newId === current.studentId) return
    // Key holding the typed text. During a pending conflict it is the previous student's:
    // the current key still holds the OTHER draft, which must never be overwritten or removed.
    const ownKey = conflict ? conflict.fromId : current.studentId
    setMissingStudent(false)
    setConflict(null)
    writePref(LAST_STUDENT_PREF, newId)
    clearTimeout(saveTimer.current)
    saveTimer.current = null
    if (!hasDraftContent(current)) {
      // Text erased during a conflict: its saved copy goes too
      if (conflict && ownKey !== newId) removeDraft(ownKey)
      const newDraft = readDraft(newId)
      setForm(newDraft ? formFromDraft(newId, newDraft) : { ...current, studentId: newId })
      setRestored(newDraft ? restoredFrom(newDraft) : null)
      return
    }
    // The text already typed moves with the selection (another student = another lesson request)
    const newDraft = newId === ownKey ? null : readDraft(newId)
    setForm({ ...current, studentId: newId, submittedAt: 0 })
    setRestored(null)
    if (newDraft) {
      // It stays saved under its own key until the teacher chooses (written now, so the
      // last keystrokes are not lost if they pick « Remplacer par ce brouillon »)
      writeDraft(ownKey, current)
      setConflict({ draft: newDraft, fromId: ownKey })
    } else if (ownKey !== newId) {
      removeDraft(ownKey)
    }
  }

  /** « Remplacer par ce brouillon »: the typed text stays saved under the previous student. */
  const takeConflictDraft = () => {
    if (!conflict) return
    setForm((f) => formFromDraft(f.studentId, conflict.draft))
    setRestored(restoredFrom(conflict.draft))
    setConflict(null)
  }

  /** « Garder mon texte »: it replaces the other draft and leaves no copy under the previous student. */
  const keepTypedText = () => {
    if (!conflict) return
    removeDraft(conflict.fromId)
    setConflict(null)
  }

  /** Empties the form and its draft (a new clientKey: a new lesson request). */
  const clear = () => {
    clearTimeout(saveTimer.current)
    saveTimer.current = null
    if (conflict) {
      // Only the typed text goes: the student's other draft is kept and shown
      removeDraft(conflict.fromId)
      takeConflictDraft()
      return
    }
    removeDraft(formRef.current?.studentId)
    setForm((f) => formFromDraft(f.studentId, null))
    setRestored(null)
    setSavedAt(null)
  }

  /** Saves the draft marked as sent right before the request; returns the sent form. */
  const markSent = () => {
    const sent = { ...formRef.current, submittedAt: Date.now() }
    formRef.current = sent
    setForm(sent)
    flush()
    return sent
  }

  /** The request was answered: the lesson row holds the sources, the draft is done. */
  const finish = (studentId) => {
    clearTimeout(saveTimer.current)
    saveTimer.current = null
    removeDraft(studentId)
    writePref(LAST_STUDENT_PREF, studentId)
    lastSaved.current = formRef.current ? signatureOf(formRef.current) : ''
  }

  return {
    form,
    update,
    missingStudent,
    restored,
    conflict,
    savedAt,
    storageFailed,
    changeStudent,
    takeConflictDraft,
    keepTypedText,
    clear,
    markSent,
    finish,
  }
}
