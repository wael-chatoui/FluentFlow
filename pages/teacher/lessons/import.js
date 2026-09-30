import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { api, ApiError } from '@/utils/apiClient'
import TeacherShell from '@/components/teacher/TeacherShell'
import BackLink from '@/components/teacher/lessons/BackLink'
import EmptyNote from '@/components/teacher/lessons/EmptyNote'
import StudentPicker, { CHIP_LIMIT } from '@/components/teacher/lessons/StudentPicker'
import StepCard from '@/components/teacher/import/StepCard'
import SourceAdder from '@/components/teacher/import/SourceAdder'
import SourceRow from '@/components/teacher/import/SourceRow'
import ExerciseOptions, { buildOptions, optionErrors } from '@/components/teacher/import/ExerciseOptions'
import ImportBar from '@/components/teacher/import/ImportBar'
import ImportSummary from '@/components/teacher/import/ImportSummary'
import {
  COUNT_DEFAULT,
  EXERCISE_TYPES,
  EXTRACT_CONCURRENCY,
  MAX_SOURCES,
  checkFile,
  deriveTitle,
  extractPdf,
  fileKey,
  frenchError,
  nextKey,
  parseGoogleLink,
  resolveLink,
  sourceIssue,
} from '@/components/teacher/import/importUtils'
import {
  LEVEL_LABELS,
  isAbortError,
  isValidId,
  parseLocalDate,
  plural,
  studentDisplayName,
  todayLocal,
} from '@/components/teacher/format'
import { useBeforeUnload, useMountedRef } from '@/components/teacher/hooks'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/NewLesson.module.css'
import imp from '@/components/teacher/import/Import.module.css'

function newRow(base) {
  return {
    key: nextKey(),
    kind: 'pdf',
    file: null,
    url: '',
    label: '',
    size: 0,
    sourceName: '',
    dedupeKey: '',
    title: null, // null = derived from the source name
    lessonDate: todayLocal(),
    extract: 'pending', // 'pending' | 'loading' | 'done' | 'error'
    extractError: null,
    text: '',
    pages: null,
    warning: null,
    textEdited: false,
    manual: false,
    showText: false,
    run: 'idle', // 'idle' | 'queued' | 'running' | 'published' | 'failed'
    runError: null,
    lessonId: null,
    maybeCreated: false,
    startedAt: null,
    ...base,
  }
}

function rowTitle(row, student) {
  return row.title ?? deriveTitle(row.sourceName, student)
}

function dateError(row) {
  return parseLocalDate(row.lessonDate) ? null : 'Indique la date du cours.'
}

function isReady(row) {
  return !row.lessonId && (row.run === 'idle' || row.run === 'failed') && !sourceIssue(row) && !dateError(row)
}

export default function ImportLessonsPage() {
  const router = useRouter()
  const mounted = useMountedRef()
  const uid = useId()
  const fieldId = (name) => `${uid}-${name}`

  // null until the router is ready (?student= is client-only)
  const [studentId, setStudentId] = useState(null)
  const [students, setStudents] = useState(null)
  const [studentsError, setStudentsError] = useState(null)
  const [missingStudent, setMissingStudent] = useState(false)
  const studentsController = useRef(null)
  const checkedQueryStudent = useRef(false)

  const [rows, setRows] = useState([])
  const rowsRef = useRef(rows)
  rowsRef.current = rows
  const [rejected, setRejected] = useState([])
  const extractControllers = useRef(new Map())

  const [options, setOptions] = useState({
    count: String(COUNT_DEFAULT),
    types: EXERCISE_TYPES.map((t) => t.value),
    instructions: '',
  })

  // 'edit' | 'running' | 'finished'
  const [phase, setPhase] = useState('edit')
  const [run, setRun] = useState(null)
  const [stopRequested, setStopRequested] = useState(false)
  const [batchKeys, setBatchKeys] = useState([])
  const busyRef = useRef(false)
  const stopRef = useRef(false)
  const runController = useRef(null)
  const summaryRef = useRef(null)
  const docsRef = useRef(null)

  const [finishedAt, setFinishedAt] = useState(null)
  const running = phase === 'running'
  useBeforeUnload(running)

  // End of a run: bring the summary card into view and move focus to it
  useEffect(() => {
    if (!finishedAt) return
    const el = summaryRef.current
    if (!el) return
    el.focus({ preventScroll: true })
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [finishedAt])

  // ---- Init from ?student= ----
  useEffect(() => {
    if (!router.isReady || studentId !== null) return
    const q = router.query.student
    setStudentId(isValidId(q) ? q : '')
  }, [router.isReady, router.query.student, studentId])

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

  // The ?student= id must exist in the list
  useEffect(() => {
    if (!students || studentId === null || checkedQueryStudent.current) return
    checkedQueryStudent.current = true
    if (studentId && !students.some((s) => s.id === studentId)) {
      setMissingStudent(true)
      setStudentId('')
    }
  }, [students, studentId])

  // ---- Cleanup: abort every request on unmount ----
  useEffect(() => {
    const controllers = extractControllers.current
    return () => {
      controllers.forEach((c) => c.abort())
      controllers.clear()
      runController.current?.abort()
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

  // ---- Rows ----
  const patchRow = useCallback((key, patch) => {
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...(typeof patch === 'function' ? patch(r) : patch) } : r)))
  }, [])

  const startExtraction = useCallback(
    (row) => {
      const controller = new AbortController()
      extractControllers.current.set(row.key, controller)
      patchRow(row.key, { extract: 'loading', extractError: null })
      const request = row.kind === 'pdf' ? extractPdf(row.file, controller.signal) : resolveLink(row.url, controller.signal)
      request
        .then((data) => {
          if (extractControllers.current.get(row.key) !== controller) return
          extractControllers.current.delete(row.key)
          if (!mounted.current) return
          patchRow(row.key, (r) => ({
            extract: 'done',
            text: data.text,
            pages: data.pages,
            warning: data.warning,
            sourceName: data.sourceName || r.sourceName || r.url,
            textEdited: false,
            manual: false,
            // Nothing extracted (scanned PDF…): open the text box so the teacher can paste it
            showText: r.showText || !data.text.trim(),
          }))
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

  const addFiles = (files) => {
    if (busyRef.current) return
    const current = rowsRef.current
    const seen = new Set(current.map((r) => r.dedupeKey))
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
      added.push(newRow({ kind: 'pdf', file, size: file.size, sourceName: file.name, dedupeKey: key }))
    })
    if (overflow) {
      errors.push(
        `Maximum ${MAX_SOURCES} documents par import : ${plural(overflow, 'fichier')} ${overflow > 1 ? "n'ont" : "n'a"} pas été ${overflow > 1 ? 'ajoutés' : 'ajouté'}.`
      )
    }
    setRejected(errors)
    if (added.length) setRows((rs) => [...rs, ...added])
  }

  const addLink = (raw) => {
    if (busyRef.current) return "Attends la fin de l'import."
    const parsed = parseGoogleLink(raw)
    if (parsed.error) return parsed.error
    const current = rowsRef.current
    if (current.some((r) => r.dedupeKey === parsed.dedupeKey)) return 'Ce lien est déjà dans la liste.'
    if (current.length >= MAX_SOURCES) return `Maximum ${MAX_SOURCES} documents par import.`
    setRejected([])
    setRows((rs) => [...rs, newRow({ kind: 'link', url: parsed.url, label: parsed.label, dedupeKey: parsed.dedupeKey })])
    return null
  }

  const removeRow = (key) => {
    if (busyRef.current) return
    const controller = extractControllers.current.get(key)
    if (controller) {
      controller.abort()
      extractControllers.current.delete(key)
    }
    setRows((rs) => rs.filter((r) => r.key !== key))
    setBatchKeys((ks) => ks.filter((k) => k !== key))
  }

  const retryExtraction = (key) => {
    if (busyRef.current || extractControllers.current.has(key)) return
    patchRow(key, { extract: 'pending', extractError: null })
  }

  // ---- Derived ----
  const selected = students && studentId ? students.find((s) => s.id === studentId) || null : null
  const optErrors = useMemo(() => optionErrors(options), [options])
  const optionsValid = Object.keys(optErrors).length === 0
  const readyRows = rows.filter(isReady)
  const isExtracting = (r) => r.extract === 'pending' || r.extract === 'loading'
  const extractingCount = rows.filter(isExtracting).length
  const pendingCount = rows.filter(
    (r) => !r.lessonId && (r.run === 'idle' || r.run === 'failed') && !isExtracting(r) && !isReady(r)
  ).length
  const hasCreated = rows.some((r) => r.lessonId)
  const extracting = extractingCount > 0

  let blocker = null
  if (!students) blocker = studentsError ? 'Impossible de charger les élèves.' : 'Chargement des élèves…'
  else if (!studentId) blocker = 'Choisis un élève.'
  else if (rows.length === 0) blocker = 'Ajoute au moins un document.'
  else if (!optionsValid) blocker = Object.values(optErrors)[0]
  else if (readyRows.length === 0) {
    const allPublished = rows.every((r) => r.lessonId && r.run === 'published')
    if (extracting) blocker = 'Extraction du texte en cours…'
    else if (allPublished) blocker = 'Tout est importé ✓ Ajoute d’autres documents pour continuer.'
    else blocker = 'Corrige les documents à vérifier.'
  }

  // ---- Run queue (one lesson at a time) ----
  const runQueue = async (keys) => {
    if (busyRef.current || !keys.length || !studentId) return
    busyRef.current = true
    stopRef.current = false
    setStopRequested(false)

    const targetStudent = studentId
    const student = selected
    const body = buildOptions(options)
    const snapshot = new Map(rowsRef.current.map((r) => [r.key, r]))
    const keySet = new Set(keys)

    setRejected([])
    setRows((rs) => rs.map((r) => (keySet.has(r.key) ? { ...r, run: 'queued', showText: false } : r)))
    setBatchKeys((ks) => [...new Set([...ks, ...keys])])
    setRun({ total: keys.length, done: 0, currentTitle: '' })
    setPhase('running')

    for (const key of keys) {
      if (stopRef.current) break
      const row = snapshot.get(key)
      if (!row) continue
      const title = rowTitle(row, student).trim()
      patchRow(key, { run: 'running', runError: null, maybeCreated: false, startedAt: Date.now() })
      setRun((r) => ({ ...r, currentTitle: title || row.sourceName || row.label }))

      const controller = new AbortController()
      runController.current = controller
      try {
        let res
        if (row.lessonId) {
          res = await api(`/api/teacher/lessons/${row.lessonId}/regenerate`, {
            method: 'POST',
            body: { options: body },
            signal: controller.signal,
          })
        } else {
          const payload = {
            studentId: targetStudent,
            lessonDate: row.lessonDate,
            sourceName: (row.sourceName || row.url || row.label).slice(0, 255),
            text: row.text.trim(),
            options: body,
          }
          if (title) payload.title = title
          res = await api('/api/teacher/lessons/import', { method: 'POST', body: payload, signal: controller.signal })
        }
        if (!mounted.current) return
        const lesson = res?.lesson
        if (!lesson?.id) throw new ApiError('Réponse inattendue du serveur.', 500)
        if (lesson.status === 'published') {
          patchRow(key, { run: 'published', lessonId: lesson.id, runError: null })
        } else {
          patchRow(key, { run: 'failed', lessonId: lesson.id, runError: lesson.error || 'La génération a échoué.' })
        }
      } catch (err) {
        if (isAbortError(err) || !mounted.current) return
        // No answer / server crash: the lesson may exist anyway (duplicate risk on retry)
        const unknown = !err?.status || err.status >= 500
        patchRow(key, {
          run: 'failed',
          runError: frenchError(err, 'La génération a échoué.'),
          maybeCreated: !row.lessonId && unknown,
        })
      }
      if (!mounted.current) return
      setRun((r) => ({ ...r, done: r.done + 1 }))
    }

    if (!mounted.current) return
    runController.current = null
    // Items left in the queue after "stop" go back to their previous state
    setRows((rs) => rs.map((r) => (r.run === 'queued' ? { ...r, run: r.lessonId ? 'failed' : 'idle' } : r)))
    busyRef.current = false
    setStopRequested(false)
    setRun(null)
    setPhase('finished')
    setFinishedAt(Date.now())
  }

  const handleImport = () => {
    if (busyRef.current || blocker || !readyRows.length) return
    runQueue(readyRows.map((r) => r.key))
  }

  const handleRetryRun = (key) => {
    if (busyRef.current || !optionsValid) return
    const row = rowsRef.current.find((r) => r.key === key)
    if (!row || row.run !== 'failed') return
    if (!row.lessonId && (sourceIssue(row) || dateError(row))) return
    runQueue([key])
  }

  const handleStop = () => {
    stopRef.current = true
    setStopRequested(true)
  }

  const handleMore = () => {
    if (busyRef.current) return
    setRows((rs) => rs.filter((r) => r.run !== 'published'))
    setBatchKeys([])
    setPhase('edit')
    requestAnimationFrame(() => docsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }))
  }

  const handleStudentChange = (e) => {
    if (busyRef.current || hasCreated) return
    setStudentId(e.target.value)
    setMissingStudent(false)
  }

  // ---- Render ----
  const batchRows = rows.filter((r) => batchKeys.includes(r.key))
  const showSummary = phase === 'finished' && batchRows.length > 0 && Boolean(studentId)
  const backHref = studentId ? `/teacher/students/${studentId}` : '/teacher'
  const backLabel = selected ? studentDisplayName(selected) : 'Mes élèves'
  const noStudents = students && students.length === 0

  return (
    <TeacherShell>
      <Head>
        <title>Importer des leçons — Preply Lessons</title>
      </Head>

      {!running && <BackLink href={backHref} label={backLabel} />}

      <div className={styles.page}>
        <div className={styles.pageHead}>
          <h1 className={styles.pageTitle}>
            <span className={`${styles.pageEmoji} ${imp.pageEmoji}`} aria-hidden="true">📥</span> Importer des leçons
          </h1>
          <p className={styles.pageSub}>
            Transforme tes anciens bilans (PDF ou Google Docs) en leçons interactives : un document = une leçon
            avec son bilan et ses exercices.
          </p>
        </div>

        {showSummary && (
          <ImportSummary
            ref={summaryRef}
            published={batchRows.filter((r) => r.run === 'published').length}
            failed={batchRows.filter((r) => r.run === 'failed').length}
            skipped={batchRows.filter((r) => r.run === 'idle').length}
            studentId={studentId}
            onMore={handleMore}
          />
        )}

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
              emoji="👋"
              title="Aucun élève pour l'instant"
              text="Ajoute d'abord un élève : tu pourras ensuite importer ses anciennes leçons."
            />
            <Link href="/teacher" className={`${ui.btn} ${ui.green} ${ui.block}`}>
              <span aria-hidden="true">👥</span> Voir mes élèves
            </Link>
          </>
        ) : (
          <div className={styles.form} aria-busy={running}>
            {missingStudent && (
              <div className={`${bits.alert} ${bits.warning}`} role="alert">
                <span className={bits.alertIcon} aria-hidden="true">🔍</span>
                <span className={bits.alertBody}>
                  L&apos;élève indiqué dans le lien est introuvable. Choisis-le dans la liste.
                </span>
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
                  <span aria-hidden="true">🔒 </span>
                  Des leçons ont déjà été créées pour cet élève. Clique sur « Importer d&apos;autres documents » ou
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
                <SourceAdder
                  disabled={running}
                  full={rows.length >= MAX_SOURCES}
                  onFiles={addFiles}
                  onLink={addLink}
                />

                {rejected.length > 0 && (
                  <div className={`${bits.alert} ${bits.warning}`} role="alert">
                    <span className={bits.alertIcon} aria-hidden="true">🙅</span>
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
                        <button
                          type="button"
                          className={`${ui.btn} ${ui.small} ${bits.tap}`}
                          onClick={() => setRejected([])}
                        >
                          OK
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                <p className={imp.scanNote}>
                  <span aria-hidden="true">💡 </span>
                  Les PDF scannés (photos de pages) contiennent peu ou pas de texte : ouvre « Voir le texte » et colle
                  le contenu à la main.
                </p>

                {rows.length > 0 && (
                  <>
                    <div className={imp.listHead}>
                      <h3 className={imp.listTitle}>{plural(rows.length, 'document')}</h3>
                    </div>
                    <ul className={imp.list} aria-label="Documents à importer">
                      {rows.map((row, i) => (
                        <SourceRow
                          key={row.key}
                          row={row}
                          index={i}
                          title={rowTitle(row, selected)}
                          dateError={dateError(row)}
                          busy={running}
                          retryDisabled={!optionsValid}
                          onChange={(patch) => patchRow(row.key, patch)}
                          onRemove={() => removeRow(row.key)}
                          onRetryExtract={() => retryExtraction(row.key)}
                          onRetryRun={() => handleRetryRun(row.key)}
                        />
                      ))}
                    </ul>
                  </>
                )}
              </StepCard>
            </div>

            {/* ---- 3 · Exercices ---- */}
            <StepCard
              id={fieldId('options-title')}
              number="3"
              tone="orange"
              title="Exercices"
              sub="Réglages communs à toutes les leçons importées"
            >
              <ExerciseOptions value={options} onChange={setOptions} disabled={running} />
            </StepCard>

            <ImportBar
              running={running}
              readyCount={readyRows.length}
              pendingCount={pendingCount}
              extractingCount={extractingCount}
              blocker={blocker}
              onImport={handleImport}
              run={run}
              stopRequested={stopRequested}
              onStop={handleStop}
            />
          </div>
        )}
      </div>
    </TeacherShell>
  )
}
