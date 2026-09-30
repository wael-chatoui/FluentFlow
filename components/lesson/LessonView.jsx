import { useId, useMemo } from 'react'
import { normalizeLessonContent } from '@/utils/lesson/schema'
import RichText, { RichTextInline } from '@/components/lesson/RichText'
import { formatLessonDate } from '@/components/lesson/format'
import styles from '@/components/lesson/LessonView.module.css'

// Lesson recap renderer, shared by the student, teacher and admin pages.
// `content` is lessons.content (see utils/lesson/schema.js); it is re-normalized
// here so null / partial / legacy content never crashes the page.
//
// The recap's own labels are English (student UI) even on the French teacher and
// admin pages, hence lang="en" on the root. French content (words, examples,
// corrections) carries lang="fr" so screen readers switch voice; explanations
// follow the student's level (English or French) and keep the root's language.
//
// Printing ("Save as PDF"): styles/print.css prints only `.lesson-view` on a page
// that has one, and the print-only header below brands it.

const PRINT_DATE = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }

function Section({ id, anchor, icon, title, tone = 'blue', children }) {
  return (
    <section id={anchor} className={[styles.section, styles[tone]].join(' ')} aria-labelledby={id}>
      <h2 id={id} className={styles.sectionTitle}>
        <span className={styles.sectionIcon} aria-hidden="true">
          {icon}
        </span>
        {title}
      </h2>
      {children}
    </section>
  )
}

// Below 640px the table is laid out as cards: the explicit roles keep the table
// semantics (WebKit drops them for display:block tables) and data-label shows
// which line is French / English.
function WordTable({ rows, caption }) {
  return (
    <table className={styles.table} role="table">
      <caption className="sr-only">{caption}</caption>
      <thead role="rowgroup">
        <tr role="row">
          <th scope="col" role="columnheader">
            French
          </th>
          <th scope="col" role="columnheader">
            English
          </th>
          <th scope="col" role="columnheader">
            Example
          </th>
        </tr>
      </thead>
      <tbody role="rowgroup">
        {rows.map((row, i) => (
          <tr key={i} role="row">
            <td role="cell" data-label="FR" className={styles.fr} lang="fr">
              <RichTextInline text={row.fr} />
            </td>
            <td role="cell" data-label="EN" className={styles.en}>
              <RichTextInline text={row.en} />
            </td>
            <td role="cell" data-label="e.g." className={`${styles.example} ${row.example ? '' : styles.noExample}`}>
              {row.example ? (
                <RichTextInline text={row.example} lang="fr" />
              ) : (
                <span className={styles.none}>
                  <span aria-hidden="true">—</span>
                  <span className="sr-only">No example</span>
                </span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

// "Now I can tell…" → "tell…" (the section heading already says "Now I can…")
function stripNowICan(item) {
  const rest = item.replace(/^now,?\s+i\s+can\s*[:,-]?\s*/i, '')
  return rest || item
}

function PrintHeader({ title, lessonDate, studentName, teacherName }) {
  const date = formatLessonDate(lessonDate, PRINT_DATE)
  const meta = [date, studentName].filter(Boolean).join(' · ')
  return (
    <div className={styles.printHeader}>
      <p className={styles.printBrand} lang="fr">
        {teacherName} — cours de français
      </p>
      <p className={styles.printTitle}>{title}</p>
      {meta && <p className={styles.printMeta}>{meta}</p>}
    </div>
  )
}

/**
 * @param {{ content: object, title?: string, lessonDate?: string, studentName?: string, teacherName?: string }} props
 *   title / lessonDate ('YYYY-MM-DD') / studentName / teacherName (default "Wael") only
 *   appear in the printed recap's header; title defaults to content.title.
 */
export default function LessonView({ content, title, lessonDate, studentName, teacherName }) {
  const uid = useId()
  const c = useMemo(() => normalizeLessonContent(content), [content])

  const isEmpty =
    !c.summary &&
    c.topics.length === 0 &&
    c.vocabulary.length === 0 &&
    c.corrections.length === 0 &&
    c.grammar.length === 0 &&
    c.expressions.length === 0 &&
    c.homework.length === 0 &&
    c.can_do.length === 0

  if (isEmpty) {
    return (
      <div className={`lesson-view ${styles.root}`} lang="en">
        <p className={styles.empty}>
          <span className={styles.emptyIcon} aria-hidden="true">
            📄
          </span>
          This recap is empty
        </p>
      </div>
    )
  }

  return (
    <article className={`lesson-view ${styles.root}`} lang="en">
      <PrintHeader
        title={(typeof title === 'string' && title.trim()) || c.title}
        lessonDate={lessonDate}
        studentName={typeof studentName === 'string' ? studentName.trim() : ''}
        teacherName={(typeof teacherName === 'string' && teacherName.trim()) || 'Wael'}
      />

      {(c.summary || c.topics.length > 0) && (
        <Section id={`${uid}-summary`} anchor="recap-summary" icon="💬" title="Summary" tone="blue">
          {c.summary && <RichText text={c.summary} className={styles.summary} />}
          {c.topics.length > 0 && (
            <ul className={styles.topics} aria-label="Topics" role="list">
              {c.topics.map((t, i) => (
                <li key={i} className={styles.topic}>
                  <RichTextInline text={t} />
                </li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {c.vocabulary.length > 0 && (
        <Section id={`${uid}-vocabulary`} anchor="recap-vocabulary" icon="📚" title="Vocabulary" tone="green">
          <WordTable rows={c.vocabulary} caption="Vocabulary: French, English, example" />
        </Section>
      )}

      {c.corrections.length > 0 && (
        <Section id={`${uid}-corrections`} anchor="recap-corrections" icon="✏️" title="Corrections" tone="red">
          <ul className={styles.corrections} role="list">
            {c.corrections.map((item, i) => (
              <li key={i} className={styles.correction}>
                <div className={styles.correctionPair}>
                  <span className={styles.wrong}>
                    <span className="sr-only">You said: </span>
                    <s lang="fr">
                      <RichTextInline text={item.wrong} />
                    </s>
                  </span>
                  <span className={styles.arrow} aria-hidden="true">
                    →
                  </span>
                  <span className={styles.right}>
                    <span className="sr-only">Better: </span>
                    <RichTextInline text={item.right} lang="fr" />
                  </span>
                </div>
                {item.explanation && (
                  <p className={styles.correctionWhy}>
                    <RichTextInline text={item.explanation} />
                  </p>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {c.grammar.length > 0 && (
        <Section id={`${uid}-grammar`} anchor="recap-grammar" icon="🧩" title="Grammar" tone="yellow">
          <div className={styles.rules}>
            {c.grammar.map((g, i) => (
              <div key={i} className={styles.rule}>
                <h3 className={styles.ruleTitle}>
                  <span className={styles.deco} aria-hidden="true">
                    ⭐{' '}
                  </span>
                  <RichTextInline text={g.title} />
                </h3>
                <RichText text={g.explanation} className={styles.ruleText} />
                {g.examples.length > 0 && (
                  <ul className={styles.examples} aria-label="Examples" role="list" lang="fr">
                    {g.examples.map((ex, j) => (
                      <li key={j}>
                        <RichTextInline text={ex} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {c.expressions.length > 0 && (
        <Section id={`${uid}-expressions`} anchor="recap-expressions" icon="🗣️" title="Useful expressions" tone="purple">
          <WordTable rows={c.expressions} caption="Useful expressions: French, English, example" />
        </Section>
      )}

      {c.homework.length > 0 && (
        <Section id={`${uid}-homework`} anchor="recap-homework" icon="🏠" title="Homework" tone="orange">
          <ol className={styles.homework} role="list">
            {c.homework.map((h, i) => (
              <li key={i} className={styles.homeworkItem}>
                <RichTextInline text={h.task} />
                {h.link && (
                  <>
                    {' '}
                    <a href={h.link} target="_blank" rel="noopener noreferrer" className={styles.link}>
                      Open link<span className={styles.deco} aria-hidden="true"> ↗</span>
                      <span className="sr-only"> (opens in a new tab)</span>
                    </a>
                  </>
                )}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {c.can_do.length > 0 && (
        <Section id={`${uid}-can-do`} anchor="recap-can-do" icon="🎯" title="Now I can…" tone="green">
          <ul className={styles.canDo} role="list">
            {c.can_do.map((item, i) => (
              <li key={i} className={styles.canDoItem}>
                <span className={styles.check} aria-hidden="true">
                  ✓
                </span>
                <RichTextInline text={stripNowICan(item)} />
              </li>
            ))}
          </ul>
        </Section>
      )}
    </article>
  )
}
