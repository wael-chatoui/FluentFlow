import { useId, useRef } from 'react'
import { BLANK } from '@/utils/lesson/schema'
import { cx } from '@/components/admin/common/format'
import { AddButton, ChipsInput, Field, TextField } from '@/components/admin/lessons/fields'
import { LIMITS, countBlanks, removeAt, replaceAt } from '@/components/admin/lessons/editorModel'
import admin from '@/components/admin/common/admin.module.css'
import styles from '@/components/admin/lessons/editor.module.css'
import { ArrowLeftRight, Check, X } from 'lucide-react'
import Icon from '@/components/ui/Icon'

const LETTERS = ['A', 'B', 'C']

function GroupError({ id, error }) {
  if (!error) return null
  return (
    <p id={id} className={admin.fieldError}>
      {error}
    </p>
  )
}

export function McqEditor({ exercise: e, index, update, errors }) {
  const uid = useId()
  const p = `exercises.${index}`
  const choicesError = errors[`${p}.choices`] || errors[`${p}.answer`]
  const errorId = `${uid}-err`
  return (
    <>
      <TextField
        label="Phrase"
        value={e.sentence}
        maxLength={400}
        lang="en"
        error={errors[`${p}.sentence`]}
        onChange={(sentence) => update({ sentence })}
      />
      <fieldset className={styles.fieldset} aria-describedby={choicesError ? errorId : undefined}>
        <legend className={admin.label}>Choix — coche la bonne réponse</legend>
        <ol className={styles.choiceList}>
          {e.choices.map((choice, i) => {
            const correct = e.answer === i
            return (
              <li key={i} className={cx(styles.choiceRow, correct && styles.choiceCorrect)}>
                <label className={styles.radio}>
                  <input
                    type="radio"
                    name={`${uid}-answer`}
                    checked={correct}
                    onChange={() => update({ answer: i })}
                  />
                  <span className="sr-only">Bonne réponse : choix {LETTERS[i]}</span>
                  <span aria-hidden="true" className={styles.letter}>
                    {correct ? <Icon icon={Check} size={16} strokeWidth={3} /> : LETTERS[i]}
                  </span>
                </label>
                <input
                  className={cx(admin.input, choicesError && admin.invalid)}
                  value={choice}
                  maxLength={160}
                  lang="en"
                  aria-label={`Choix ${LETTERS[i]}${correct ? ' (bonne réponse)' : ''}`}
                  aria-invalid={choicesError ? true : undefined}
                  aria-describedby={choicesError ? errorId : undefined}
                  onChange={(ev) => update({ choices: replaceAt(e.choices, i, ev.target.value) })}
                />
              </li>
            )
          })}
        </ol>
        <GroupError id={errorId} error={choicesError} />
      </fieldset>
    </>
  )
}

export function FillBlankEditor({ exercise: e, index, update, errors }) {
  const inputRef = useRef(null)
  const p = `exercises.${index}`
  const n = countBlanks(e.sentence)

  const insertBlank = () => {
    const el = inputRef.current
    const value = e.sentence
    const start = el?.selectionStart ?? value.length
    const end = el?.selectionEnd ?? value.length
    const before = value.slice(0, start)
    const after = value.slice(end)
    const padLeft = before && !/\s$/.test(before) ? ' ' : ''
    const padRight = after && !/^[\s.,!?;:]/.test(after) ? ' ' : ''
    update({ sentence: `${before}${padLeft}${BLANK}${padRight}${after}` })
    requestAnimationFrame(() => {
      if (!el) return
      el.focus()
      const pos = before.length + padLeft.length + BLANK.length
      el.setSelectionRange(pos, pos)
    })
  }

  return (
    <>
      <Field
        label="Phrase à trou"
        error={errors[`${p}.sentence`]}
        hint={
          n === 1
            ? `Un seul trou (${BLANK}) : parfait.`
            : `Écris ${BLANK} (trois tirets bas) à l'endroit du mot manquant — exactement un trou.`
        }
      >
        {(props) => (
          <div className={styles.inline}>
            <input
              {...props}
              ref={inputRef}
              value={e.sentence}
              maxLength={400}
              lang="en"
              onChange={(ev) => update({ sentence: ev.target.value })}
            />
            <button type="button" className={styles.insertBtn} onClick={insertBlank} disabled={n >= 1}>
              Insérer {BLANK}
            </button>
          </div>
        )}
      </Field>
      <ChipsInput
        label="Réponses acceptées"
        values={e.answers}
        max={LIMITS.fillAnswers}
        maxLength={80}
        lang="en"
        placeholder="Ex. : went"
        hint="La première est affichée comme réponse attendue. Entrée pour ajouter."
        error={errors[`${p}.answers`]}
        onChange={(answers) => update({ answers })}
      />
      <TextField label="Indice (optionnel)" value={e.hint} maxLength={160} onChange={(hint) => update({ hint })} />
    </>
  )
}

export function MatchEditor({ exercise: e, index, update, errors }) {
  const uid = useId()
  const p = `exercises.${index}`
  const pairs = e.pairs || []
  const groupError = errors[`${p}.pairs`]
  return (
    <fieldset className={styles.fieldset} aria-describedby={groupError ? `${uid}-err` : undefined}>
      <legend className={admin.label}>
        Paires ({pairs.length}/{LIMITS.pairsMax}, minimum {LIMITS.pairsMin})
      </legend>
      <ol className={styles.pairList}>
        {pairs.map((pair, j) => {
          const rowError = errors[`${p}.pairs.${j}`]
          const errId = `${uid}-pair-${j}`
          const setPair = (patch) => update({ pairs: replaceAt(pairs, j, { ...pair, ...patch }) })
          return (
            <li key={j} className={styles.pairRow}>
              <div className={styles.pairInputs}>
                <input
                  className={cx(admin.input, rowError && !pair.fr.trim() && admin.invalid)}
                  value={pair.fr}
                  maxLength={80}
                  lang="fr"
                  placeholder="Français"
                  aria-label={`Paire ${j + 1}, français`}
                  aria-invalid={rowError && !pair.fr.trim() ? true : undefined}
                  aria-describedby={rowError ? errId : undefined}
                  onChange={(ev) => setPair({ fr: ev.target.value })}
                />
                <span className={styles.pairArrow} aria-hidden="true">
                  <Icon icon={ArrowLeftRight} size={18} />
                </span>
                <input
                  className={cx(admin.input, rowError && !pair.en.trim() && admin.invalid)}
                  value={pair.en}
                  maxLength={80}
                  lang="en"
                  placeholder="Anglais"
                  aria-label={`Paire ${j + 1}, anglais`}
                  aria-invalid={rowError && !pair.en.trim() ? true : undefined}
                  aria-describedby={rowError ? errId : undefined}
                  onChange={(ev) => setPair({ en: ev.target.value })}
                />
                <button
                  type="button"
                  className={cx(styles.iconBtn, styles.iconDanger)}
                  onClick={() => update({ pairs: removeAt(pairs, j) })}
                  aria-label={`Supprimer la paire ${j + 1}`}
                  title="Supprimer"
                >
                  <Icon icon={X} size={18} />
                </button>
              </div>
              <GroupError id={errId} error={rowError} />
            </li>
          )
        })}
      </ol>
      <GroupError id={`${uid}-err`} error={groupError} />
      <AddButton count={pairs.length} max={LIMITS.pairsMax} onClick={() => update({ pairs: [...pairs, { fr: '', en: '' }] })}>
        Ajouter une paire
      </AddButton>
    </fieldset>
  )
}
