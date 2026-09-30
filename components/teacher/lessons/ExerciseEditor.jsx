import { useEffect, useId, useRef, useState } from 'react'
import { BLANK } from '@/utils/lesson/schema'
import { EDIT_LIMITS, countBlanks, exerciseErrors, fromEditable, toEditable } from '@/components/teacher/lessons/exerciseEdit'
import ui from '@/components/ui/ui.module.css'
import bits from '@/components/teacher/lessons/lessonUi.module.css'
import styles from '@/components/teacher/lessons/ExerciseEditor.module.css'

const LETTERS = ['A', 'B', 'C']

function FieldError({ id, error }) {
  if (!error) return null
  return (
    <p id={id} className={bits.fieldError}>
      <span aria-hidden="true">⚠️</span> {error}
    </p>
  )
}

function TextInput({ label, value, onChange, error, hint, maxLength, lang, optional, inputRef, children }) {
  const id = useId()
  const describedBy = [error && `${id}-err`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={bits.label}>
        {label} {optional && <span className={bits.optional}>(facultatif)</span>}
      </label>
      <div className={styles.inline}>
        <input
          ref={inputRef}
          id={id}
          className={`${bits.input} ${error ? bits.invalid : ''}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={maxLength}
          lang={lang}
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
        />
        {children}
      </div>
      {hint && (
        <p id={`${id}-hint`} className={bits.hint}>
          {hint}
        </p>
      )}
      <FieldError id={`${id}-err`} error={error} />
    </div>
  )
}

function McqFields({ draft, set, errors }) {
  const uid = useId()
  return (
    <>
      <TextInput label="Phrase" value={draft.sentence} onChange={(sentence) => set({ sentence })} error={errors.sentence} maxLength={EDIT_LIMITS.sentence} lang="fr" />
      <fieldset className={styles.group} aria-describedby={errors.choices ? `${uid}-err` : undefined}>
        <legend className={bits.label}>Choix — coche la bonne réponse</legend>
        <ol className={styles.choices}>
          {draft.choices.map((choice, i) => {
            const correct = draft.answer === i
            return (
              <li key={i} className={`${styles.choice} ${correct ? styles.correct : ''}`}>
                <label className={styles.radio}>
                  <input type="radio" name={`${uid}-answer`} checked={correct} onChange={() => set({ answer: i })} />
                  <span className="sr-only">Bonne réponse : choix {LETTERS[i]}</span>
                  <span className={styles.letter} aria-hidden="true">{correct ? '✓' : LETTERS[i]}</span>
                </label>
                <input
                  className={`${bits.input} ${errors.choices ? bits.invalid : ''}`}
                  value={choice}
                  maxLength={EDIT_LIMITS.choice}
                  aria-label={`Choix ${LETTERS[i]}${correct ? ' (bonne réponse)' : ''}`}
                  aria-invalid={errors.choices ? true : undefined}
                  onChange={(e) => set({ choices: draft.choices.map((c, j) => (j === i ? e.target.value : c)) })}
                />
              </li>
            )
          })}
        </ol>
        <FieldError id={`${uid}-err`} error={errors.choices} />
      </fieldset>
    </>
  )
}

function FillBlankFields({ draft, set, errors }) {
  const sentenceRef = useRef(null)
  const answersId = useId()
  const n = countBlanks(draft.sentence)

  const insertBlank = () => {
    const el = sentenceRef.current
    const value = draft.sentence
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const before = value.slice(0, start)
    const after = value.slice(end)
    const padLeft = before && !/\s$/.test(before) ? ' ' : ''
    const padRight = after && !/^[\s.,!?;:]/.test(after) ? ' ' : ''
    set({ sentence: `${before}${padLeft}${BLANK}${padRight}${after}` })
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      const pos = before.length + padLeft.length + BLANK.length
      el.setSelectionRange(pos, pos)
    })
  }

  return (
    <>
      <TextInput
        label="Phrase à trou"
        value={draft.sentence}
        onChange={(sentence) => set({ sentence })}
        error={errors.sentence}
        maxLength={EDIT_LIMITS.sentence}
        lang="fr"
        inputRef={sentenceRef}
        hint={n === 1 ? `✓ Un seul trou (${BLANK}).` : `Écris ${BLANK} (trois tirets bas) à la place du mot manquant.`}
      >
        <button type="button" className={`${ui.btn} ${ui.small} ${bits.blueGhost} ${bits.tap}`} onClick={insertBlank} disabled={n >= 1}>
          Insérer {BLANK}
        </button>
      </TextInput>
      <div className={styles.field}>
        <label htmlFor={answersId} className={bits.label}>
          Réponses acceptées
        </label>
        <textarea
          id={answersId}
          className={`${bits.textarea} ${styles.answers} ${errors.answers ? bits.invalid : ''}`}
          value={draft.answersText}
          onChange={(e) => set({ answersText: e.target.value })}
          rows={3}
          lang="fr"
          spellCheck={false}
          aria-invalid={errors.answers ? true : undefined}
          aria-describedby={`${answersId}-hint${errors.answers ? ` ${answersId}-err` : ''}`}
        />
        <p id={`${answersId}-hint`} className={bits.hint}>
          Une réponse par ligne ({EDIT_LIMITS.answers} maximum). La première est montrée comme réponse attendue.
        </p>
        <FieldError id={`${answersId}-err`} error={errors.answers} />
      </div>
      <TextInput label="Indice" optional value={draft.hint} onChange={(hint) => set({ hint })} error={errors.hint} maxLength={EDIT_LIMITS.hint} />
    </>
  )
}

function MatchFields({ draft, set, errors }) {
  const uid = useId()
  const pairs = draft.pairs
  const setPair = (i, patch) => set({ pairs: pairs.map((p, j) => (j === i ? { ...p, ...patch } : p)) })
  return (
    <fieldset className={styles.group} aria-describedby={errors.pairs ? `${uid}-err` : undefined}>
      <legend className={bits.label}>
        Paires ({pairs.length}/{EDIT_LIMITS.pairsMax}, minimum {EDIT_LIMITS.pairsMin})
      </legend>
      <ol className={styles.pairs}>
        {pairs.map((pair, i) => (
          <li key={i} className={styles.pair}>
            <input
              className={`${bits.input} ${errors.pairs && !pair.fr.trim() ? bits.invalid : ''}`}
              value={pair.fr}
              maxLength={EDIT_LIMITS.pair}
              lang="fr"
              placeholder="Français"
              aria-label={`Paire ${i + 1}, français`}
              onChange={(e) => setPair(i, { fr: e.target.value })}
            />
            <span className={styles.arrow} aria-hidden="true">↔</span>
            <input
              className={`${bits.input} ${errors.pairs && !pair.en.trim() ? bits.invalid : ''}`}
              value={pair.en}
              maxLength={EDIT_LIMITS.pair}
              lang="en"
              placeholder="Anglais"
              aria-label={`Paire ${i + 1}, anglais`}
              onChange={(e) => setPair(i, { en: e.target.value })}
            />
            <button
              type="button"
              className={`${ui.btn} ${ui.small} ${bits.redGhost} ${bits.tap} ${styles.removePair}`}
              onClick={() => set({ pairs: pairs.filter((_, j) => j !== i) })}
              disabled={pairs.length <= EDIT_LIMITS.pairsMin}
              aria-label={`Supprimer la paire ${i + 1}`}
            >
              <span aria-hidden="true">✕</span>
            </button>
          </li>
        ))}
      </ol>
      <FieldError id={`${uid}-err`} error={errors.pairs} />
      <button
        type="button"
        className={`${ui.btn} ${ui.small} ${bits.blueGhost} ${bits.tap} ${styles.addPair}`}
        onClick={() => set({ pairs: [...pairs, { fr: '', en: '' }] })}
        disabled={pairs.length >= EDIT_LIMITS.pairsMax}
      >
        <span aria-hidden="true">＋</span> Ajouter une paire
      </button>
    </fieldset>
  )
}

const FIELDS = { mcq: McqFields, fill_blank: FillBlankFields, match: MatchFields }

/**
 * Inline editor of one exercise (teacher lesson page). Errors show after the first save attempt.
 * @param {{ exercise: object, saving?: boolean, error?: string | null, resetsResults?: boolean,
 *   onSave: (exercise: object) => void, onCancel: () => void }} props
 *   onSave receives the cleaned exercise (same id and type).
 */
export default function ExerciseEditor({ exercise, saving = false, error, resetsResults = false, onSave, onCancel }) {
  const [draft, setDraft] = useState(() => toEditable(exercise))
  const [attempted, setAttempted] = useState(false)
  const formRef = useRef(null)
  const submitRef = useRef(null)

  // The « Modifier » button is replaced by this form: start in its first field
  useEffect(() => {
    formRef.current?.querySelector('input, textarea')?.focus()
  }, [])

  // A failed save (after the confirmation dialog) must not leave the focus on <body>
  useEffect(() => {
    if (!saving && error && document.activeElement === document.body) submitRef.current?.focus()
  }, [saving, error])
  const errors = exerciseErrors(draft)
  const shown = attempted ? errors : {}
  const Fields = FIELDS[draft.type]

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))

  const submit = (e) => {
    e.preventDefault()
    if (saving) return
    setAttempted(true)
    if (Object.keys(errors).length) {
      requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus())
      return
    }
    onSave(fromEditable(draft))
  }

  return (
    <form
      ref={formRef}
      className={styles.editor}
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !saving) {
          e.preventDefault()
          onCancel()
        }
      }}
      noValidate
    >
      <fieldset className={styles.fieldset} disabled={saving}>
        <legend className="sr-only">Modifier l&apos;exercice</legend>
        <TextInput label="Consigne" value={draft.prompt} onChange={(prompt) => set({ prompt })} error={shown.prompt} maxLength={EDIT_LIMITS.prompt} lang="en" hint="Laisse vide pour la consigne par défaut." />
        {Fields ? <Fields draft={draft} set={set} errors={shown} /> : <p className={bits.hint}>Type d&apos;exercice inconnu.</p>}
        <TextInput label="Explication" optional value={draft.explanation} onChange={(explanation) => set({ explanation })} error={shown.explanation} maxLength={EDIT_LIMITS.explanation} />
      </fieldset>

      {resetsResults && (
        <p className={`${bits.alert} ${bits.warning} ${styles.notice}`}>
          <span className={bits.alertIcon} aria-hidden="true">⚠️</span>
          <span className={bits.alertBody}>
            Modifier un exercice remet à zéro les résultats de l&apos;élève sur cette leçon (score, tentatives, erreurs).
          </span>
        </p>
      )}
      {error && (
        <div className={`${bits.alert} ${bits.error}`} role="alert">
          <span className={bits.alertIcon} aria-hidden="true">⚠️</span>
          <span className={bits.alertBody}>{error}</span>
        </div>
      )}

      <div className={styles.actions}>
        <button type="button" className={`${ui.btn} ${ui.small} ${bits.tap}`} onClick={onCancel} disabled={saving}>
          Annuler
        </button>
        <button
          ref={submitRef}
          type="submit"
          className={`${ui.btn} ${ui.small} ${ui.green} ${bits.tap}`}
          disabled={saving}
          aria-busy={saving || undefined}
        >
          {saving && <span className={bits.spinner} aria-hidden="true" />}
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
      </div>
    </form>
  )
}
