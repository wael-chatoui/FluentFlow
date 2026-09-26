import { useId, useMemo } from 'react'
import { normalizeLessonContent } from '@/utils/lesson/schema'
import RichText, { RichTextInline } from '@/components/lesson/RichText'
import styles from '@/components/lesson/LessonView.module.css'

// Lesson recap renderer, shared by the student and teacher pages.
// `content` is lessons.content (see utils/lesson/schema.js); it is re-normalized
// here so null / partial / legacy content never crashes the page.

function Section({ id, icon, title, tone = 'blue', children, className }) {
  return (
    <section className={[styles.section, styles[tone], className].filter(Boolean).join(' ')} aria-labelledby={id}>
      <h2 id={id} className={styles.sectionTitle}>
        <span className={styles.sectionIcon} aria-hidden="true">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function WordTable({ rows, caption }) {
  return (
    <table className={styles.table}>
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">French</th>
          <th scope="col">English</th>
          <th scope="col">Example</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i}>
            <td data-label="French" className={styles.fr}>
              <RichTextInline text={row.fr} />
            </td>
            <td data-label="English" className={styles.en}>
              <RichTextInline text={row.en} />
            </td>
            <td data-label="Example" className={styles.example}>
              {row.example ? <RichTextInline text={row.example} /> : <span className={styles.none}>—</span>}
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

export default function LessonView({ content }) {
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
      <div className={`lesson-view ${styles.root}`}>
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">📄</div>
          <div className="empty-state-title">This recap is empty</div>
        </div>
      </div>
    )
  }

  return (
    <article className={`lesson-view ${styles.root}`}>
      {(c.summary || c.topics.length > 0) && (
        <Section id={`${uid}-summary`} icon="💬" title="Summary" tone="blue">
          {c.summary && <RichText text={c.summary} className={styles.summary} />}
          {c.topics.length > 0 && (
            <ul className={styles.topics} aria-label="Topics">
              {c.topics.map((t, i) => (
                <li key={i} className={styles.topic}>{t}</li>
              ))}
            </ul>
          )}
        </Section>
      )}

      {c.vocabulary.length > 0 && (
        <Section id={`${uid}-vocabulary`} icon="📚" title="Vocabulary" tone="green">
          <WordTable rows={c.vocabulary} caption="Vocabulary: French, English, example" />
        </Section>
      )}

      {c.corrections.length > 0 && (
        <Section id={`${uid}-corrections`} icon="✏️" title="Corrections" tone="red">
          <ul className={styles.corrections}>
            {c.corrections.map((item, i) => (
              <li key={i} className={styles.correction}>
                <div className={styles.correctionPair}>
                  <span className={styles.wrong}>
                    <span className="sr-only">You said: </span>
                    <s>{item.wrong}</s>
                  </span>
                  <span className={styles.arrow} aria-hidden="true">→</span>
                  <span className={styles.right}>
                    <span className="sr-only">Better: </span>
                    <RichTextInline text={item.right} />
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
        <Section id={`${uid}-grammar`} icon="🧩" title="Grammar" tone="yellow">
          <div className={styles.rules}>
            {c.grammar.map((g, i) => (
              <div key={i} className={styles.rule}>
                <h3 className={styles.ruleTitle}>
                  <span aria-hidden="true">⭐ </span>
                  <RichTextInline text={g.title} />
                </h3>
                <RichText text={g.explanation} className={styles.ruleText} />
                {g.examples.length > 0 && (
                  <ul className={styles.examples} aria-label="Examples">
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
        <Section id={`${uid}-expressions`} icon="🗣️" title="Useful expressions" tone="purple">
          <WordTable rows={c.expressions} caption="Useful expressions: French, English, example" />
        </Section>
      )}

      {c.homework.length > 0 && (
        <Section id={`${uid}-homework`} icon="🏠" title="Homework" tone="orange">
          <ol className={styles.homework}>
            {c.homework.map((h, i) => (
              <li key={i} className={styles.homeworkItem}>
                <RichTextInline text={h.task} />
                {h.link && (
                  <>
                    {' '}
                    <a
                      href={h.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`lesson-homework-link ${styles.link}`}
                    >
                      Open link<span aria-hidden="true"> ↗</span>
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
        <Section id={`${uid}-can-do`} icon="🎯" title="Now I can…" tone="green">
          <ul className={styles.canDo}>
            {c.can_do.map((item, i) => (
              <li key={i} className={styles.canDoItem}>
                <span className={styles.check} aria-hidden="true">✓</span>
                <span>{stripNowICan(item)}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </article>
  )
}
