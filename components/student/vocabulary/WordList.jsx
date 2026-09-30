import { useMemo } from 'react'
import Link from 'next/link'
import { accentStyle } from '@/components/ui/accents'
import { formatLessonDate, plural } from '@/components/lesson/format'
import { RichTextInline } from '@/components/lesson/RichText'
import { plainText } from '@/components/practice/utils'
import SpeakButton from '@/components/student/vocabulary/SpeakButton'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/student/vocabulary/Vocabulary.module.css'

// Where a word comes from: its section of the lesson recap (anchors set by LessonView)
const sectionHref = (lessonId, kind) =>
  `/student/lessons/${encodeURIComponent(lessonId)}#recap-${kind === 'expression' ? 'expressions' : 'vocabulary'}`

function groupByLesson(items) {
  const groups = []
  const byId = new Map()
  for (const item of items) {
    const id = String(item.lessonId || '')
    let group = byId.get(id)
    if (!group) {
      group = { lessonId: id, title: item.lessonTitle || 'Lesson', date: item.lesson_date || '', items: [] }
      byId.set(id, group)
      groups.push(group)
    }
    group.items.push(item)
  }
  return groups
}

// Recap fields may highlight a key word with **…** (shown as a highlight, never raw)
function WordItem({ item, speech, showLesson }) {
  return (
    <li className={styles.item} style={showLesson ? accentStyle(item.lessonId) : undefined}>
      <div className={styles.itemMain}>
        <p className={styles.itemFr} lang="fr">
          <RichTextInline text={item.fr} />
          {item.kind === 'expression' && <span className={styles.kindTag}>expression</span>}
        </p>
        {item.en && (
          <p className={styles.itemEn}>
            <RichTextInline text={item.en} />
          </p>
        )}
        {item.example && (
          <p className={styles.itemExample} lang="fr">
            <RichTextInline text={item.example} />
          </p>
        )}
        {showLesson && item.lessonTitle && (
          <p className={styles.itemLesson}>
            <span className={styles.itemLessonDot} aria-hidden="true" />
            {item.lessonId ? (
              <Link href={sectionHref(item.lessonId, item.kind)} className={styles.lessonLink}>
                {item.lessonTitle}
              </Link>
            ) : (
              item.lessonTitle
            )}
          </p>
        )}
      </div>
      <SpeakButton speech={speech} text={plainText(item.fr)} speakKey={item.key} />
    </li>
  )
}

/**
 * Word bank list. Grouped by lesson (newest first), or flat when `flat`
 * (search results), where each item shows its lesson instead. Lesson names link
 * to the lesson's recap; each group can start flashcards with its own words.
 * @param {{ items: object[], flat: boolean, speech: object, onPracticeLesson: (lessonId: string) => void }} props
 */
export default function WordList({ items, flat, speech, onPracticeLesson }) {
  const groups = useMemo(() => (flat ? [] : groupByLesson(items)), [items, flat])

  if (flat) {
    return (
      <ul className={styles.items}>
        {items.map((item) => (
          <WordItem key={item.key} item={item} speech={speech} showLesson />
        ))}
      </ul>
    )
  }

  return (
    <div className={styles.groups}>
      {groups.map((g) => {
        const date = formatLessonDate(g.date, { month: 'short', day: 'numeric', year: 'numeric' })
        return (
          <section key={g.lessonId || 'none'} className={styles.group} style={accentStyle(g.lessonId)}>
            <header className={styles.groupHead}>
              <span className={styles.groupDot} aria-hidden="true" />
              <div className={styles.groupHeadText}>
                <h2 className={styles.groupTitle}>
                  {g.lessonId ? (
                    <Link href={sectionHref(g.lessonId, 'word')} className={styles.lessonLink}>
                      {g.title}
                    </Link>
                  ) : (
                    g.title
                  )}
                </h2>
                <p className={styles.groupMeta}>
                  {date && <time dateTime={g.date}>{date}</time>}
                  {date && ' · '}
                  {plural(g.items.length, 'item')}
                </p>
              </div>
              {g.lessonId && g.items.length > 1 && onPracticeLesson && (
                <button
                  type="button"
                  className={`${ui.btn} ${ui.small} ${ui.ghost} ${styles.groupPractice}`}
                  onClick={() => onPracticeLesson(g.lessonId)}
                  aria-label={`Practice these words with flashcards: ${g.title}`}
                >
                  <span aria-hidden="true">🃏</span> Practice these words
                </button>
              )}
            </header>
            <ul className={styles.items}>
              {g.items.map((item) => (
                <WordItem key={item.key} item={item} speech={speech} showLesson={false} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

export function WordListSkeleton() {
  return (
    <div className={styles.groups} aria-hidden="true">
      {[3, 2].map((n, gi) => (
        <section key={gi} className={styles.group}>
          <header className={styles.groupHead}>
            <span className={`${ui.skel} ${styles.skelDot}`} />
            <div className={styles.groupHeadText}>
              <span className={`${ui.skel} ${styles.skelGroupTitle}`} />
              <span className={`${ui.skel} ${styles.skelGroupMeta}`} />
            </div>
          </header>
          <ul className={styles.items}>
            {Array.from({ length: n }, (_, i) => (
              <li key={i} className={styles.item}>
                <div className={styles.itemMain}>
                  <span className={`${ui.skel} ${styles.skelFr}`} />
                  <span className={`${ui.skel} ${styles.skelEn}`} />
                  <span className={`${ui.skel} ${styles.skelEx}`} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}
