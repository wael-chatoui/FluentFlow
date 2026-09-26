import { AddButton, ChipsInput, RowControls, TextArea, TextField } from '@/components/admin/lessons/fields'
import { EMPTY, LIMITS, move, removeAt, replaceAt } from '@/components/admin/lessons/editorModel'
import admin from '@/components/admin/common/admin.module.css'
import styles from '@/components/admin/lessons/editor.module.css'

const HIGHLIGHT_HINT = 'Texte brut. Entoure un mot de **deux astérisques** pour le surligner.'

function Section({ icon, title, sub, children }) {
  return (
    <section className={admin.section}>
      <div className={admin.sectionHead}>
        <h2 className={admin.sectionTitle}>
          <span aria-hidden="true">{icon}</span> {title}
        </h2>
        {sub && <p className={admin.sectionSub}>{sub}</p>}
      </div>
      <div className={styles.sectionBody}>{children}</div>
    </section>
  )
}

/** Generic list of object rows with ↑↓✕ controls. */
function Rows({ items, onChange, label, renderRow, empty }) {
  if (items.length === 0) return <p className={styles.emptyRows}>{empty}</p>
  return (
    <ol className={styles.rows}>
      {items.map((item, i) => {
        const update = (patch) => onChange(replaceAt(items, i, { ...item, ...patch }))
        return (
          <li key={item._k ?? i} className={styles.row}>
            <div className={styles.rowHead}>
              <span className={styles.rowIndex}>
                {label} {i + 1}
              </span>
              <RowControls
                index={i}
                count={items.length}
                label={`${label.toLowerCase()} ${i + 1}`}
                onMove={(to) => onChange(move(items, i, to))}
                onRemove={() => onChange(removeAt(items, i))}
              />
            </div>
            {renderRow(item, i, update)}
          </li>
        )
      })}
    </ol>
  )
}

/** List of plain strings, one input per line, with ↑↓✕. */
function StringRows({ items, onChange, label, errors, errorPrefix, maxLength, placeholder, lang }) {
  if (items.length === 0) return null
  return (
    <ol className={styles.stringRows}>
      {items.map((value, i) => (
        <li key={i} className={styles.stringRow}>
          <TextField
            label={`${label} ${i + 1}`}
            srLabel
            value={value}
            maxLength={maxLength}
            placeholder={placeholder}
            lang={lang}
            error={errors[`${errorPrefix}.${i}`]}
            onChange={(v) => onChange(replaceAt(items, i, v))}
            className={styles.grow}
          />
          <RowControls
            index={i}
            count={items.length}
            label={`${label.toLowerCase()} ${i + 1}`}
            onMove={(to) => onChange(move(items, i, to))}
            onRemove={() => onChange(removeAt(items, i))}
          />
        </li>
      ))}
    </ol>
  )
}

function WordRows({ section, items, onChange, errors, max, label, frLabel }) {
  return (
    <>
      <Rows
        items={items}
        onChange={onChange}
        label={label}
        empty="Aucune ligne."
        renderRow={(row, i, update) => (
          <div className={styles.grid3}>
            <TextField
              label={frLabel}
              value={row.fr}
              maxLength={section === 'vocabulary' ? 120 : 160}
              lang="fr"
              error={errors[`content.${section}.${i}.fr`]}
              onChange={(fr) => update({ fr })}
            />
            <TextField
              label="Anglais"
              value={row.en}
              maxLength={section === 'vocabulary' ? 160 : 200}
              lang="en"
              error={errors[`content.${section}.${i}.en`]}
              onChange={(en) => update({ en })}
            />
            <TextField
              label="Exemple"
              value={row.example}
              maxLength={300}
              lang="fr"
              onChange={(example) => update({ example })}
            />
          </div>
        )}
      />
      <AddButton count={items.length} max={max} onClick={() => onChange([...items, EMPTY.word()])}>
        Ajouter une ligne
      </AddButton>
    </>
  )
}

/**
 * "Contenu" tab: form editors for every field of lessons.content.
 * @param {{ content: object, onChange: (content: object) => void, errors: Record<string, string> }} props
 */
export default function ContentTab({ content: c, onChange, errors }) {
  const set = (key) => (value) => onChange({ ...c, [key]: value })

  return (
    <div className={admin.stack}>
      <Section icon="📝" title="Récap">
        <TextField
          label="Titre du récap"
          value={c.title}
          maxLength={LIMITS.contentTitle}
          error={errors['content.title']}
          hint="Affiché en tête du récap de l'élève (« Lesson recap » si vide)."
          onChange={set('title')}
        />
        <TextArea
          label="Résumé"
          value={c.summary}
          rows={7}
          maxLength={LIMITS.summary}
          hint={`${HIGHLIGHT_HINT} Ligne vide = nouveau paragraphe. ${c.summary.length}/${LIMITS.summary}.`}
          onChange={set('summary')}
        />
        <ChipsInput
          label="Sujets abordés"
          values={c.topics}
          max={LIMITS.topics}
          maxLength={LIMITS.topic}
          placeholder="Ex. : les vacances"
          onChange={set('topics')}
        />
      </Section>

      <Section icon="📖" title="Vocabulaire" sub={`${c.vocabulary.length}/${LIMITS.vocabulary}`}>
        <WordRows
          section="vocabulary"
          label="Mot"
          frLabel="Français"
          items={c.vocabulary}
          max={LIMITS.vocabulary}
          errors={errors}
          onChange={set('vocabulary')}
        />
      </Section>

      <Section icon="💬" title="Expressions" sub={`${c.expressions.length}/${LIMITS.expressions}`}>
        <WordRows
          section="expressions"
          label="Expression"
          frLabel="Français"
          items={c.expressions}
          max={LIMITS.expressions}
          errors={errors}
          onChange={set('expressions')}
        />
      </Section>

      <Section icon="🩹" title="Corrections" sub={`${c.corrections.length}/${LIMITS.corrections}`}>
        <Rows
          items={c.corrections}
          onChange={set('corrections')}
          label="Correction"
          empty="Aucune correction."
          renderRow={(row, i, update) => (
            <div className={styles.grid3}>
              <TextField
                label="❌ Fautif"
                value={row.wrong}
                maxLength={300}
                lang="fr"
                error={errors[`content.corrections.${i}.wrong`]}
                onChange={(wrong) => update({ wrong })}
              />
              <TextField
                label="✅ Correct"
                value={row.right}
                maxLength={300}
                lang="fr"
                error={errors[`content.corrections.${i}.right`]}
                onChange={(right) => update({ right })}
              />
              <TextField
                label="Explication"
                value={row.explanation}
                maxLength={500}
                onChange={(explanation) => update({ explanation })}
              />
            </div>
          )}
        />
        <AddButton
          count={c.corrections.length}
          max={LIMITS.corrections}
          onClick={() => set('corrections')([...c.corrections, EMPTY.correction()])}
        >
          Ajouter une correction
        </AddButton>
      </Section>

      <Section icon="🧠" title="Grammaire" sub={`${c.grammar.length}/${LIMITS.grammar}`}>
        <Rows
          items={c.grammar}
          onChange={set('grammar')}
          label="Point"
          empty="Aucun point de grammaire."
          renderRow={(g, i, update) => (
            <div className={styles.fields}>
              <TextField
                label="Titre"
                value={g.title}
                maxLength={120}
                error={errors[`content.grammar.${i}.title`]}
                onChange={(title) => update({ title })}
              />
              <TextArea
                label="Explication"
                value={g.explanation}
                rows={4}
                maxLength={1500}
                hint={HIGHLIGHT_HINT}
                error={errors[`content.grammar.${i}.explanation`]}
                onChange={(explanation) => update({ explanation })}
              />
              <div className={admin.field}>
                <span className={admin.label}>Exemples</span>
                <StringRows
                  items={g.examples}
                  label="Exemple"
                  errors={errors}
                  errorPrefix={`content.grammar.${i}.examples`}
                  maxLength={300}
                  lang="fr"
                  onChange={(examples) => update({ examples })}
                />
                <AddButton
                  count={g.examples.length}
                  max={LIMITS.grammarExamples}
                  onClick={() => update({ examples: [...g.examples, ''] })}
                >
                  Ajouter un exemple
                </AddButton>
              </div>
            </div>
          )}
        />
        <AddButton count={c.grammar.length} max={LIMITS.grammar} onClick={() => set('grammar')([...c.grammar, EMPTY.grammar()])}>
          Ajouter un point de grammaire
        </AddButton>
      </Section>

      <Section icon="🏠" title="Devoirs" sub={`${c.homework.length}/${LIMITS.homework}`}>
        <Rows
          items={c.homework}
          onChange={set('homework')}
          label="Devoir"
          empty="Aucun devoir."
          renderRow={(h, i, update) => (
            <div className={styles.grid2}>
              <TextArea
                label="Consigne"
                value={h.task}
                rows={2}
                maxLength={600}
                error={errors[`content.homework.${i}.task`]}
                onChange={(task) => update({ task })}
              />
              <TextField
                label="Lien (optionnel)"
                type="url"
                inputMode="url"
                value={h.link}
                maxLength={2000}
                placeholder="https://…"
                error={errors[`content.homework.${i}.link`]}
                onChange={(link) => update({ link })}
              />
            </div>
          )}
        />
        <AddButton count={c.homework.length} max={LIMITS.homework} onClick={() => set('homework')([...c.homework, EMPTY.homework()])}>
          Ajouter un devoir
        </AddButton>
      </Section>

      <Section icon="🏆" title="Je sais maintenant…" sub={`${c.can_do.length}/${LIMITS.canDo}`}>
        {c.can_do.length === 0 && <p className={styles.emptyRows}>Aucune ligne.</p>}
        <StringRows
          items={c.can_do}
          label="Compétence"
          errors={errors}
          errorPrefix="content.can_do"
          maxLength={200}
          placeholder="Ex. : talk about my weekend"
          onChange={set('can_do')}
        />
        <AddButton count={c.can_do.length} max={LIMITS.canDo} onClick={() => set('can_do')([...c.can_do, ''])}>
          Ajouter une compétence
        </AddButton>
      </Section>
    </div>
  )
}
