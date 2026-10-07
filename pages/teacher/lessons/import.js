import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { api } from '@/utils/apiClient'
import useUnsavedGuard from '@/components/ui/useUnsavedGuard'
import TeacherShell from '@/components/teacher/TeacherShell'
import BackLink from '@/components/teacher/lessons/BackLink'
import EmptyNote from '@/components/teacher/lessons/EmptyNote'
import StudentPicker, { CHIP_LIMIT } from '@/components/teacher/lessons/StudentPicker'
import StepCard from '@/components/teacher/import/StepCard'
import SourceAdder from '@/components/teacher/import/SourceAdder'
import SourceRow from '@/components/teacher/import/SourceRow'
import ExerciseOptions, { buildOptions, optionErrors } from '@/components/teacher/import/ExerciseOptions'
import ReviewOption, { readReviewPreference, writeReviewPreference } from '@/components/teacher/import/ReviewOption'
import ImportBar from '@/components/teacher/import/ImportBar'
import ImportSummary from '@/components/teacher/import/ImportSummary'
import useImportRunner from '@/components/teacher/import/useImportRunner'
import { clearQueue, readQueue, serializeQueue, writeQueue } from '@/components/teacher/import/importSession'
import {
  ACTIVE_RUNS,
  byLessonDate,
  byLessonNumber,
  canRetry,
  dateError,
  isReady,
  newRow,
  rowTitle,
} from '@/components/teacher/import/rows'
import {
  COUNT_DEFAULT,
  EXERCISE_TYPES,
  EXTRACT_CONCURRENCY,
  MAX_SOURCES,
  checkFile,
  extractPdf,
  fileKey,
  fileKind,
  frenchError,
  readTextFile,
  resolveLink,
} from '@/components/teacher/import/importUtils'
import { extractGoogleLinks, parseGoogleLink } from '@/utils/import/googleLinks'
import { detectLessonDate, titleFromName } from '@/utils/import/detect'
import {
  LEVEL_LABELS,
  formatLessonDate,
  isAbortError,
  isValidId,
  plural,
  studentDisplayName,
} from '@/components/teacher/format'
import { useMountedRef } from '@/components/teacher/hooks'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/NewLesson.module.css'
import imp from '@/components/teacher/import/Import.module.css'
import { Ban, Import, Lightbulb, Lock, Pause, RefreshCw, SearchX, UserPlus, Users } from 'lucide-react'
import Icon from '@/components/ui/Icon'

const LEAVE_RUNNING =
  "L'import est en cours : les leçons déjà envoyées continueront d'être générées, mais les documents en attente ne seront pas importés. Quitter quand même ?"
const LEAVE_UNSENT = "Des documents de la liste n'ont pas encore été importés. Quitter quand même ?"

// Settings a re-added file gets back from a queue saved before a reload
function fromOrphan(orphan, base) {
  return {
    ...base,
    clientKey: orphan.clientKey,
    title: typeof orphan.title === 'string' ? orphan.title : null,
    lessonDate: orphan.lessonDate || base.lessonDate,
    dateFrom: orphan.lessonDate ? orphan.dateFrom ?? null : base.dateFrom,
    sent: Boolean(orphan.sent),
  }
}

export default function ImportLessonsPage() {
  const router = useRouter()
  const mounted = useMountedRef()
  const uid = useId()
  const fieldId = (name) => `${uid}-${name}`

  // null until the router is ready (?student= and the saved queue are client-only)
  const [studentId, setStudentId] = useState(null)
  const [students, setStudents] = useState(null)
  const [studentsError, setStudentsError] = useState(null)
  const [missingStudent, setMissingStudent] = useState(false)
  const studentsController = useRef(null)
  const checkedStudent = useRef(false)
  const restored = useRef(false)

  const [rows, setRows] = useState([])
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const [orphans, setOrphans] = useState([])
  const [restoreNote, setRestoreNote] = useState(null)
  const [rejected, setRejected] = useState([])
  const [announce, setAnnounce] = useState('')
  const extractControllers = useRef(new Map())
  const [lessonsByDate, setLessonsByDate] = useState(null)
  const [existingLessons, setExistingLessons] = useState(null)

  const [options, setOptions] = useState({
    count: String(COUNT_DEFAULT),
    types: EXERCISE_TYPES.map((t) => t.value),
    instructions: '',
  })
  const [review, setReview] = useState(false)

  const [batchKeys, setBatchKeys] = useState([])
  const [finishedAt, setFinishedAt] = useState(null)
  const summaryRef = useRef(null)
  const docsRef = useRef(null)

  const patchRow = useCallback((key, patch) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r)))
  }, [])

  const runner = useImportRunner({ rows, rowsRef, setRows, patchRow, mounted })

  const running = rows.some((r) => ACTIVE_RUNS.has(r.run))
  // Leaving is safe once every document is sent (generation continues on the server)
  const waiting = rows.some((r) => r.run === 'queued' || r.run === 'sending')
  const unsent = rows.some((r) => !r.lessonId && !ACTIVE_RUNS.has(r.run))
  useUnsavedGuard(waiting || unsent, waiting ? LEAVE_RUNNING : LEAVE_UNSENT)

  // End of a run: bring the summary card into view and move focus to it
  const wasRunning = useRef(false)
  useEffect(() => {
    if (wasRunning.current && !running) setFinishedAt(Date.now())
    wasRunning.current = running
  }, [running])

  useEffect(() => {
    if (!finishedAt) return
    const el = summaryRef.current
    if (!el) return
    el.focus({ preventScroll: true })
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [finishedAt])

  // ---- Init: queue saved in this tab, else ?student= ----
  useEffect(() => {
    if (!router.isReady || studentId !== null) return
    const q = router.query.student
    const queryId = isValidId(q) ? q : ''
    const saved = readQueue()
    if (saved && (!queryId || queryId === saved.studentId)) {
      setRows(saved.rows)
      setOrphans(saved.orphans)
      const sentKeys = saved.rows.filter((r) => r.lessonId).map((r) => r.key)
      setBatchKeys(sentKeys)
      if (sentKeys.length || saved.orphans.length) setRestoreNote({ created: sentKeys.length })
      setStudentId(saved.studentId)
    } else {
      if (saved) clearQueue()
      setStudentId(queryId)
    }
    restored.current = true
  }, [router.isReady, router.query.student, studentId])

  useEffect(() => {
    setReview(readReviewPreference())
  }, [])

  const handleReview = (checked) => {
    setReview(checked)
    writeReviewPreference(checked)
  }

  // ---- Students ----
  const loadStudents = useCallback(async () => {
    studentsController.current?.abort()
    const controller = new AbortController()
    studentsController.current = controller
    setStudentsError(null)
    setStudents(null)
    try {
      const data = await api('/api/teacher/students', { signal: controller.signal })
      if (!mounted.current || controller.signal.aborted) return
      const list = Array.isArray(data.students) ? data.students : []
      setStudents([...list].sort((a, b) => studentDisplayName(a).localeCompare(studentDisplayName(b), 'fr')))
    } catch (err) {
      if (isAbortError(err) || !mounted.current) return
      setStudentsError(frenchError(err, 'Impossible de charger la liste des élèves.'))
    }
  }, [mounted])

  useEffect(() => {
    loadStudents()
    return () => studentsController.current?.abort()
  }, [loadStudents])

  // The student from the link (or the saved queue) must exist in the list
  useEffect(() => {
    if (!students || studentId === null || checkedStudent.current) return
    checkedStudent.current = true
    if (studentId && !students.some((s) => s.id === studentId)) {
      setMissingStudent(true)
      setStudentId('')
      setRows([])
      setOrphans([])
      setRestoreNote(null)
      clearQueue()
    }
  }, [students, studentId])

  // Dates of the student's lessons (reloaded after each run): warns before
  // importing the same lesson twice
  useEffect(() => {
    setLessonsByDate(null)
    setExistingLessons(null)
    if (!studentId) return undefined
    const controller = new AbortController()
    api(`/api/teacher/students/${studentId}`, { signal: controller.signal })
      .then((data) => {
        const byDate = new Map()
        const bySource = new Map()
        const list = Array.isArray(data?.lessons) ? data.lessons : []
        list.forEach((l) => {
          if (l?.lesson_date && !byDate.has(l.lesson_date)) {
            byDate.set(l.lesson_date, { id: l.id, title: l.title || '', lesson_date: l.lesson_date, source_name: l.source_name || '' })
          }
          if (l?.source_name) {
            const cleanSource = l.source_name.toLowerCase().trim()
            if (!bySource.has(cleanSource)) {
              bySource.set(cleanSource, { id: l.id, title: l.title || '', lesson_date: l.lesson_date, source_name: l.source_name })
            }
          }
        })
        if (mounted.current) {
          setLessonsByDate(byDate)
          setExistingLessons({ byDate, bySource, list })
        }
      })
      .catch(() => {
        // Only a hint: the import works without it
      })
    return () => controller.abort()
  }, [studentId, finishedAt, mounted])

  // ---- Cleanup: abort the extractions on unmount (the runner aborts its own requests) ----
  useEffect(() => {
    const controllers = extractControllers.current
    return () => {
      controllers.forEach((c) => c.abort())
      controllers.clear()
    }
  }, [])

  // A file dropped next to the zone must not make the browser open it
  useEffect(() => {
    const prevent = (e) => {
      if (Array.from(e.dataTransfer?.types || []).includes('Files')) e.preventDefault()
    }
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  const selected = students && studentId ? students.find((s) => s.id === studentId) || null : null

  // ---- Keep the queue in sessionStorage (no text, no files) ----
  useEffect(() => {
    if (!restored.current || studentId === null) return
    writeQueue(serializeQueue(studentId, rows, orphans, (row) => rowTitle(row, selected)))
  }, [rows, orphans, studentId, selected])

  // ---- Extraction ----
  const startExtraction = useCallback(
    (row) => {
      const controller = new AbortController()
      extractControllers.current.set(row.key, controller)
      patchRow(row.key, { extract: 'loading', extractError: null })
      let request
      if (row.kind === 'pdf') request = extractPdf(row.file, controller.signal)
      else if (row.kind === 'text') request = readTextFile(row.file)
      else request = resolveLink(row.url, controller.signal)
      request
        .then((data) => {
          if (extractControllers.current.get(row.key) !== controller) return
          extractControllers.current.delete(row.key)
          if (!mounted.current) return
          patchRow(row.key, (r) => {
            const sourceName = data.sourceName || r.sourceName || r.label
            const patch = {
              extract: 'done',
              text: data.text,
              pages: data.pages,
              warning: data.warning,
              sourceName,
              textEdited: false,
              warningDismissed: false,
              manual: false,
              // Nothing extracted (scanned PDF…): open the text box so the teacher can paste it
              showText: r.showText || !data.text.trim(),
            }
            if (!r.lessonDate) {
              const found = detectLessonDate({ name: sourceName, text: data.text })
              if (found) Object.assign(patch, { lessonDate: found.date, dateFrom: found.from })
            }
            if (r.lessonNumber === null) patch.lessonNumber = titleFromName(sourceName).lessonNumber
            if (!r.dbDuplicate && existingLessons?.bySource) {
              const match = existingLessons.bySource.get(sourceName.toLowerCase().trim())
              if (match) patch.dbDuplicate = match
            }
            return patch
          })
        })
        .catch((err) => {
          if (extractControllers.current.get(row.key) !== controller) return
          extractControllers.current.delete(row.key)
          if (isAbortError(err) || !mounted.current) return
          patchRow(row.key, { extract: 'error', extractError: frenchError(err, "L'extraction a échoué.") })
        })
    },
    [mounted, patchRow]
  )

  // Extraction queue: at most EXTRACT_CONCURRENCY requests at once
  useEffect(() => {
    const active = extractControllers.current
    const slots = EXTRACT_CONCURRENCY - active.size
    if (slots <= 0) return
    rows
      .filter((r) => r.extract === 'pending' && !active.has(r.key))
      .slice(0, slots)
      .forEach(startExtraction)
  }, [rows, startExtraction])

  // ---- Adding / removing documents ----
  const addFiles = (files) => {
    if (running) return
    const current = rowsRef.current
    const seen = new Set(current.map((r) => r.dedupeKey))
    const reused = new Set()
    const errors = []
    const added = []
    let overflow = 0
    files.forEach((file) => {
      const error = checkFile(file)
      if (error) {
        errors.push(error)
        return
      }
      const key = fileKey(file)
      if (seen.has(key)) {
        errors.push(`« ${file.name} » est déjà dans la liste.`)
        return
      }
      if (current.length + added.length >= MAX_SOURCES) {
        overflow += 1
        return
      }
      seen.add(key)
      const found = detectLessonDate({ name: file.name })
      const dbMatch = existingLessons?.bySource?.get(file.name.toLowerCase().trim()) || null
      const base = {
        kind: fileKind(file),
        file,
        size: file.size,
        sourceName: file.name,
        dedupeKey: key,
        lessonNumber: titleFromName(file.name).lessonNumber,
        lessonDate: found?.date || '',
        dateFrom: found?.from || null,
        dbDuplicate: dbMatch || null,
      }
      const orphan = orphans.find((o) => o.dedupeKey === key)
      if (orphan) reused.add(key)
      added.push(newRow(orphan ? fromOrphan(orphan, base) : base))
    })
    if (overflow) {
      errors.push(
        `Maximum ${MAX_SOURCES} documents par import : ${plural(overflow, 'fichier')} ${overflow > 1 ? "n'ont" : "n'a"} pas été ${overflow > 1 ? 'ajoutés' : 'ajouté'}.`
      )
    }
    const dbDups = added.filter((r) => r.dbDuplicate).length
    if (dbDups > 0) {
      errors.push(
        `Attention : ${plural(dbDups, 'document')} correspond déjà à une leçon enregistrée en base pour cet élève.`
      )
    }
    setRejected(errors)
    if (reused.size) setOrphans((os) => os.filter((o) => !reused.has(o.dedupeKey)))
    // L01, L02… in order
    if (added.length) setRows((rs) => [...rs, ...added.sort(byLessonNumber)])
  }

  const addLinks = async (raw) => {
    if (running) return "Attends la fin de l'import."
    const extracted = extractGoogleLinks(raw)
    if (extracted.errors.length && !extracted.links.length && !extracted.folders.length) {
      return extracted.errors[0]
    }

    const current = rowsRef.current
    const seen = new Set(current.map((r) => r.dedupeKey))
    const errors = [...extracted.errors]
    let internalDups = extracted.duplicates || 0
    let alreadyInList = 0
    let overflow = 0
    const toAdd = []

    // 1. Dossiers Google Drive
    if (extracted.folders.length) {
      for (const folder of extracted.folders) {
        try {
          const res = await api('/api/teacher/import/folder', {
            method: 'POST',
            body: { url: folder.url, studentId: studentId || undefined },
          })
          const folderFiles = Array.isArray(res?.files) ? res.files : []
          folderFiles.forEach((f) => {
            if (seen.has(f.dedupeKey)) {
              alreadyInList += 1
              return
            }
            if (current.length + toAdd.length >= MAX_SOURCES) {
              overflow += 1
              return
            }
            seen.add(f.dedupeKey)
            const found = detectLessonDate({ name: f.name })
            const dbMatch =
              f.existingLesson ||
              (f.name ? existingLessons?.bySource?.get(f.name.toLowerCase().trim()) : null)
            const base = {
              kind: f.kind,
              url: f.url,
              label: f.kind === 'doc' ? 'Google Doc' : 'Fichier Google Drive',
              sourceName: f.name,
              dedupeKey: f.dedupeKey,
              lessonNumber: titleFromName(f.name).lessonNumber,
              lessonDate: found?.date || '',
              dateFrom: found?.from || null,
              dbDuplicate: dbMatch || null,
            }
            toAdd.push(newRow(base))
          })
        } catch (err) {
          errors.push(frenchError(err, `Impossible de lire le dossier « ${folder.id} ».`))
        }
      }
    }

    // 2. Liens de documents individuels
    extracted.links.forEach((parsed) => {
      if (seen.has(parsed.dedupeKey)) {
        alreadyInList += 1
        return
      }
      if (current.length + toAdd.length >= MAX_SOURCES) {
        overflow += 1
        return
      }
      seen.add(parsed.dedupeKey)
      const base = {
        kind: parsed.kind,
        url: parsed.url,
        label: parsed.label,
        dedupeKey: parsed.dedupeKey,
      }
      toAdd.push(newRow(base))
    })

    if (overflow) {
      errors.push(
        `Maximum ${MAX_SOURCES} documents par import : ${plural(overflow, 'document')} ${
          overflow > 1 ? "n'ont" : "n'a"
        } pas été ${overflow > 1 ? 'ajoutés' : 'ajouté'}.`
      )
    }
    if (alreadyInList) {
      errors.push(
        `${plural(alreadyInList, 'document')} déjà présent dans la liste ${
          alreadyInList > 1 ? 'ont été ignorés' : 'a été ignoré'
        }.`
      )
    }
    if (internalDups) {
      errors.push(
        `${plural(internalDups, 'lien')} en double dans le texte collé ${
          internalDups > 1 ? 'ont été ignorés' : 'a été ignoré'
        }.`
      )
    }

    const dbDupsCount = toAdd.filter((r) => r.dbDuplicate).length
    if (dbDupsCount > 0) {
      errors.push(
        `Attention : ${plural(dbDupsCount, 'document')} correspond déjà à une leçon enregistrée en base pour cet élève.`
      )
    }

    setRejected(errors)
    if (toAdd.length) {
      setRows((rs) => [...rs, ...toAdd.sort(byLessonNumber)])
      setAnnounce(`${plural(toAdd.length, 'document')} ajouté(s) à la liste.`)
    } else if (!errors.length) {
      return 'Aucun nouveau document à ajouter.'
    }
    return null
  }

  const removeRow = (key) => {
    const row = rowsRef.current.find((r) => r.key === key)
    if (!row || ACTIVE_RUNS.has(row.run)) return
    const controller = extractControllers.current.get(key)
    if (controller) {
      controller.abort()
      extractControllers.current.delete(key)
    }
    setRows((rs) => rs.filter((r) => r.key !== key))
    setBatchKeys((ks) => ks.filter((k) => k !== key))
  }

  const retryExtraction = (key) => {
    if (extractControllers.current.has(key)) return
    patchRow(key, { extract: 'pending', extractError: null })
  }

  const isEditable = (r) => !r.lessonId && !ACTIVE_RUNS.has(r.run)

  const applyDateToAll = (key) => {
    const source = rowsRef.current.find((r) => r.key === key)
    if (!source?.lessonDate || running) return
    const targets = rowsRef.current.filter((r) => r.key !== key && isEditable(r))
    if (!targets.length) return
    const keys = new Set(targets.map((r) => r.key))
    setRows((rs) =>
      rs.map((r) => (keys.has(r.key) ? { ...r, lessonDate: source.lessonDate, dateFrom: 'all' } : r))
    )
    setAnnounce(`Date du ${formatLessonDate(source.lessonDate)} appliquée à ${plural(targets.length, 'autre document', 'autres documents')}.`)
  }

  // ---- Derived ----
  const optErrors = useMemo(() => optionErrors(options), [options])
  const optionsValid = Object.keys(optErrors).length === 0
  const readyRows = rows.filter(isReady)
  const retryRows = rows.filter(canRetry)
  const isExtracting = (r) => r.extract === 'pending' || r.extract === 'loading'
  const extractingCount = rows.filter(isExtracting).length
  const pendingCount = rows.filter((r) => r.run === 'idle' && !r.lessonId && !isExtracting(r) && !isReady(r)).length
  const editableDates = new Set(rows.filter(isEditable).map((r) => r.lessonDate))
  const editableCount = rows.filter(isEditable).length
  // Lessons may exist for this student: the student can no longer change
  const hasCreated = rows.some((r) => r.lessonId || r.sent) || orphans.some((o) => o.sent)
  const createdIds = new Set(rows.map((r) => r.lessonId).filter(Boolean))

  let blocker = null
  if (!students) blocker = studentsError ? 'Impossible de charger les élèves.' : 'Chargement des élèves…'
  else if (!studentId) blocker = 'Choisis un élève.'
  else if (rows.length === 0) blocker = 'Ajoute au moins un document.'
  else if (!optionsValid) blocker = Object.values(optErrors)[0]
  else if (readyRows.length === 0) {
    if (extractingCount) blocker = 'Extraction du texte en cours…'
    else if (pendingCount) blocker = 'Corrige les documents à vérifier.'
    else if (retryRows.length) blocker = '« Réessayer » relance les documents en échec.'
    else if (rows.every((r) => r.run === 'published')) blocker = 'Tout est importé. Ajoute d’autres documents pour continuer.'
    else blocker = 'Rien de nouveau à importer : ajoute d’autres documents.'
  }

  // ---- Run ----
  const launch = (keys) => {
    if (!keys.length || !studentId || !optionsValid) return
    setRejected([])
    setFinishedAt(null)
    setBatchKeys((ks) => (running ? [...new Set([...ks, ...keys])] : keys))
    runner.start(keys, { studentId, student: selected, options: buildOptions(options), publish: !review })
  }

  const handleImport = () => {
    if (running || blocker || !readyRows.length) return
    // Oldest lesson first: each one's AI context then includes the previous ones
    launch([...readyRows].sort(byLessonDate).map((r) => r.key))
  }

  const handleRetryFailed = () => launch([...retryRows].sort(byLessonDate).map((r) => r.key))

  const handleRetryRun = (key) => {
    const row = rowsRef.current.find((r) => r.key === key)
    if (row && canRetry(row)) launch([key])
  }

  const handleMore = () => {
    if (running) return
    setRows((rs) => rs.filter((r) => r.run !== 'published'))
    setBatchKeys([])
    setFinishedAt(null)
    setRestoreNote(null)
    requestAnimationFrame(() => docsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const handleStudentChange = (e) => {
    if (running || hasCreated) return
    setStudentId(e.target.value)
    setMissingStudent(false)
  }

  const dismissRestore = () => {
    setRestoreNote(null)
    setOrphans([])
  }

  // Start a new import from a restored list (offered once nothing is running)
  const clearList = () => {
    if (running) return
    extractControllers.current.forEach((c) => c.abort())
    extractControllers.current.clear()
    setRows([])
    setBatchKeys([])
    setFinishedAt(null)
    dismissRestore()
  }

  // ---- Render ----
  const batchRows = rows.filter((r) => batchKeys.includes(r.key))
  const published = batchRows.filter((r) => r.run === 'published')
  const showSummary = !running && Boolean(finishedAt) && batchRows.length > 0 && Boolean(studentId)
  const progress = running
    ? {
        total: batchRows.length,
        done: batchRows.filter((r) => !ACTIVE_RUNS.has(r.run)).length,
        queued: rows.filter((r) => r.run === 'queued').length,
        waiting: rows.filter((r) => r.run === 'queued' || r.run === 'sending').length,
        current: rows
          .filter((r) => r.run === 'sending' || r.run === 'generating')
          .map((r) => rowTitle(r, selected) || r.sourceName || r.label),
      }
    : null
  const backHref = studentId ? `/teacher/students/${studentId}` : '/teacher'
  const backLabel = selected ? studentDisplayName(selected) : 'Mes élèves'
  const noStudents = students && students.length === 0
  const generatingRestored = rows.some((r) => r.restored && r.run === 'generating')

  return (
    <TeacherShell>
      <Head>
        <title>Importer des leçons — Preply Lessons</title>
      </Head>

      <BackLink href={backHref} label={backLabel} />

      <div className={styles.page}>
        <div className={styles.pageHead}>
          <h1 className={styles.pageTitle}>
            <span className={`${styles.pageEmoji} ${imp.pageEmoji}`} aria-hidden="true">
              <Icon icon={Import} size={24} />
            </span>{' '}
            Importer des leçons
          </h1>
          <p className={styles.pageSub}>
            Transforme tes anciens bilans (PDF, Google Docs ou fichiers texte) en leçons interactives : un document
            = une leçon avec son bilan et ses exercices.
          </p>
        </div>

        {showSummary && (
          <ImportSummary
            ref={summaryRef}
            published={published.length}
            drafts={published.filter((r) => r.hidden).length}
            failed={batchRows.filter((r) => r.run === 'failed').length}
            skipped={batchRows.filter((r) => r.run === 'idle').length}
            studentId={studentId}
            onMore={handleMore}
          />
        )}

        <p className="sr-only" role="status" aria-live="polite">
          {announce}
        </p>

        {studentId === null ? (
          <div className={styles.formLoading}>
            <span className="sr-only" role="status">
              Chargement…
            </span>
            <span className={`${ui.skel} ${styles.skelCard}`} aria-hidden="true" />
            <span className={`${ui.skel} ${styles.skelCard} ${styles.skelTall}`} aria-hidden="true" />
          </div>
        ) : noStudents ? (
          <>
            <EmptyNote
              icon={UserPlus}
              title="Aucun élève pour l'instant"
              text="Ajoute d'abord un élève : tu pourras ensuite importer ses anciennes leçons."
            />
            <Link href="/teacher" className={`${ui.btn} ${ui.green} ${ui.block}`}>
              <Icon icon={Users} size={20} /> Voir mes élèves
            </Link>
          </>
        ) : (
          <div className={styles.form}>
            {missingStudent && (
              <div className={`${bits.alert} ${bits.warning}`} role="alert">
                <span className={bits.alertIcon} aria-hidden="true">
                  <Icon icon={SearchX} size={20} />
                </span>
                <span className={bits.alertBody}>
                  L&apos;élève indiqué dans le lien est introuvable. Choisis-le dans la liste.
                </span>
              </div>
            )}

            {restoreNote && (
              <div className={`${bits.alert} ${bits.info}`} role="status">
                <span className={bits.alertIcon} aria-hidden="true">
                  <Icon icon={RefreshCw} size={20} />
                </span>
                <div className={bits.alertBody}>
                  <span>
                    {restoreNote.created > 0
                      ? `Import retrouvé : ${plural(restoreNote.created, 'leçon envoyée', 'leçons envoyées')} avant le rechargement de la page.`
                      : 'Import retrouvé après le rechargement de la page.'}
                    {generatingRestored && ' Les leçons encore en génération sont suivies automatiquement.'}
                  </span>
                  {orphans.length > 0 && (
                    <>
                      <span>
                        Ces fichiers n&apos;étaient pas encore importés : ajoute-les à nouveau (leur titre et leur date
                        sont gardés).
                      </span>
                      <ul className={imp.rejected}>
                        {orphans.map((o) => (
                          <li key={o.dedupeKey}>{o.sourceName || 'Document'}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  <div className={bits.alertActions}>
                    <button type="button" className={`${ui.btn} ${ui.small} ${bits.tap}`} onClick={dismissRestore}>
                      OK
                    </button>
                    {!running && (
                      <button
                        type="button"
                        className={`${ui.btn} ${ui.small} ${bits.blueGhost} ${bits.tap}`}
                        onClick={clearList}
                      >
                        Vider la liste
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ---- 1 · Élève ---- */}
            <StepCard
              id={fieldId('student-title')}
              number="1"
              tone="blue"
              title="Élève"
              htmlFor={students && students.length > CHIP_LIMIT ? fieldId('student') : undefined}
            >
              <StudentPicker
                id={fieldId('student')}
                labelledBy={fieldId('student-title')}
                students={students}
                error={studentsError}
                value={students ? studentId : ''}
                onChange={handleStudentChange}
                onRetry={loadStudents}
                disabled={running || hasCreated}
              />
              {hasCreated && !running ? (
                <p className={bits.hint}>
                  <Icon icon={Lock} size={15} className={styles.inlineIcon} />{' '}
                  Des leçons ont déjà été envoyées pour cet élève. Clique sur « Importer d&apos;autres documents » ou
                  retire-les de la liste pour changer d&apos;élève.
                </p>
              ) : (
                selected && (
                  <p className={bits.hint}>
                    {LEVEL_LABELS[selected.level] || LEVEL_LABELS.unknown} · {plural(selected.lesson_count || 0, 'leçon')}
                  </p>
                )
              )}
            </StepCard>

            {/* ---- 2 · Documents ---- */}
            <div ref={docsRef} className={styles.statusAnchor}>
              <StepCard
                id={fieldId('docs-title')}
                number="2"
                tone="purple"
                title="Documents"
                sub="Un document = une leçon"
                aside={
                  <span className={`${styles.counter} ${rows.length ? styles.counterOk : ''}`}>
                    {rows.length} / {MAX_SOURCES}
                  </span>
                }
              >
                <SourceAdder disabled={running} full={rows.length >= MAX_SOURCES} onFiles={addFiles} onLink={addLinks} />

                {rejected.length > 0 && (
                  <div className={`${bits.alert} ${bits.warning}`} role="alert">
                    <span className={bits.alertIcon} aria-hidden="true">
                      <Icon icon={Ban} size={20} />
                    </span>
                    <div className={bits.alertBody}>
                      {rejected.length === 1 ? (
                        <span>{rejected[0]}</span>
                      ) : (
                        <ul className={imp.rejected}>
                          {rejected.map((msg, i) => (
                            <li key={i}>{msg}</li>
                          ))}
                        </ul>
                      )}
                      <div className={bits.alertActions}>
                        <button type="button" className={`${ui.btn} ${ui.small} ${bits.tap}`} onClick={() => setRejected([])}>
                          OK
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <p className={imp.scanNote}>
                  <Icon icon={Lightbulb} size={15} className={styles.inlineIcon} />{' '}
                  La date et le titre sont repris du nom du fichier (ex. « Rebecca_L07_Vouloir.pdf ») ou du début du
                  document : vérifie-les. Les PDF scannés contiennent peu de texte : ouvre « Voir le texte » et colle le
                  contenu à la main.
                </p>

                {rows.length > 0 && (
                  <>
                    <div className={imp.listHead}>
                      <h3 className={imp.listTitle}>{plural(rows.length, 'document')}</h3>
                    </div>
                    <ul className={imp.list} aria-label="Documents à importer">
                      {rows.map((row, i) => {
                        const cleanName = (row.sourceName || row.label || '').toLowerCase().trim()
                        const existingBySource =
                          row.dbDuplicate || (cleanName ? existingLessons?.bySource?.get(cleanName) : null)
                        const existingByDate = lessonsByDate?.get(row.lessonDate)
                        const existing = existingBySource
                          ? { ...existingBySource, matchKind: 'source' }
                          : existingByDate && !createdIds.has(existingByDate.id)
                          ? { ...existingByDate, matchKind: 'date' }
                          : null
                        return (
                          <SourceRow
                            key={row.key}
                            row={row}
                            index={i}
                            title={rowTitle(row, selected)}
                            dateError={dateError(row)}
                            existing={existing}
                            busy={running}
                            newTab={running}
                            retryDisabled={!optionsValid || !studentId}
                            canApplyDate={editableCount > 1 && editableDates.size > 1}
                            onChange={(patch) => patchRow(row.key, patch)}
                            onApplyDate={() => applyDateToAll(row.key)}
                            onRemove={() => removeRow(row.key)}
                            onRetryExtract={() => retryExtraction(row.key)}
                            onRetryRun={() => handleRetryRun(row.key)}
                          />
                        )
                      })}
                    </ul>
                  </>
                )}
              </StepCard>
            </div>

            {/* ---- 3 · Exercices et publication ---- */}
            <StepCard
              id={fieldId('options-title')}
              number="3"
              tone="orange"
              title="Exercices et publication"
              sub="Réglages communs à toutes les leçons importées"
            >
              <ExerciseOptions value={options} onChange={setOptions} disabled={running} />
              <ReviewOption checked={review} onChange={handleReview} disabled={running} />
            </StepCard>

            {runner.paused && (
              <div className={`${bits.alert} ${bits.error}`} role="alert">
                <span className={bits.alertIcon} aria-hidden="true">
                  <Icon icon={Pause} size={20} />
                </span>
                <div className={bits.alertBody}>
                  <span>
                    Import en pause : deux documents ont échoué avec la même erreur (« {runner.paused} »). Règle le
                    problème puis relance avec « Importer » ou « Réessayer ».
                  </span>
                  <div className={bits.alertActions}>
                    <button type="button" className={`${ui.btn} ${ui.small} ${bits.tap}`} onClick={runner.clearPaused}>
                      OK
                    </button>
                  </div>
                </div>
              </div>
            )}

            <ImportBar
              running={running}
              progress={progress}
              stopRequested={runner.stopRequested}
              onStop={runner.stop}
              readyCount={readyRows.length}
              pendingCount={pendingCount}
              extractingCount={extractingCount}
              retryCount={retryRows.length}
              blocker={blocker}
              review={review}
              retryDisabled={!optionsValid || !studentId}
              onImport={handleImport}
              onRetryFailed={handleRetryFailed}
            />
          </div>
        )}
      </div>
    </TeacherShell>
  )
}
