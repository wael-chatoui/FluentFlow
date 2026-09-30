import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { useRouter } from 'next/router'
import StudentShell from '@/components/student/StudentShell'
import WordList, { WordListSkeleton } from '@/components/student/vocabulary/WordList'
import Flashcards from '@/components/student/vocabulary/Flashcards'
import useFrenchSpeech from '@/components/student/vocabulary/useFrenchSpeech'
import { cx } from '@/components/practice/utils'
import { formatLessonDate } from '@/components/lesson/format'
import { foldFrench } from '@/utils/api/studentLessons'
import { api } from '@/utils/apiClient'
import ui from '@/components/ui/ui.module.css'
import styles from '@/components/student/vocabulary/Vocabulary.module.css'

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'word', label: 'Words' },
  { value: 'expression', label: 'Expressions' },
]

const MODES = [
  { value: 'list', label: 'List', icon: '📋' },
  { value: 'cards', label: 'Flashcards', icon: '🃏' },
]

function normalizeItems(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  raw.forEach((it, i) => {
    const fr = typeof it?.fr === 'string' ? it.fr.trim() : ''
    if (!fr) return
    const en = typeof it.en === 'string' ? it.en.trim() : ''
    const example = typeof it.example === 'string' ? it.example.trim() : ''
    const lessonId = it.lessonId ? String(it.lessonId) : ''
    out.push({
      key: `v${i}`,
      fr,
      en,
      example,
      kind: it.kind === 'expression' ? 'expression' : 'word',
      lessonId,
      lessonTitle: typeof it.lessonTitle === 'string' ? it.lessonTitle : '',
      lesson_date: typeof it.lesson_date === 'string' ? it.lesson_date : '',
      // Every lesson the word appears in (a lesson's deck also has its repeated words)
      lessonIds: Array.isArray(it.lessonIds) ? it.lessonIds.map(String) : lessonId ? [lessonId] : [],
      // Same folding as the server's dedupe: case, accents, apostrophes, punctuation
      haystack: foldFrench(`${fr} ${en} ${example}`),
    })
  })
  return out
}

/** Lessons with words (API order, newest first), for the flashcards deck picker. */
function normalizeLessons(raw) {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((l) => l?.id)
    .map((l) => ({
      id: String(l.id),
      title: typeof l.title === 'string' && l.title ? l.title : 'Lesson',
      date: typeof l.lesson_date === 'string' ? l.lesson_date : '',
    }))
}

function PageSkeleton() {
  return (
    <div className={styles.page} aria-hidden="true">
      <div>
        <span className={`${ui.skel} ${styles.skelTitle}`} />
        <span className={`${ui.skel} ${styles.skelSub}`} />
      </div>
      <span className={`${ui.skel} ${styles.skelSeg}`} />
      <span className={`${ui.skel} ${styles.skelSearch}`} />
      <WordListSkeleton />
    </div>
  )
}

export default function StudentVocabularyPage() {
  const router = useRouter()
  const [state, setState] = useState({ status: 'loading', items: [], lessons: [], error: '' })
  const [reloadKey, setReloadKey] = useState(0)
  const [kind, setKind] = useState('all')
  const [query, setQuery] = useState('')
  const [direction, setDirection] = useState('fr-en')
  const speech = useFrenchSpeech()

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    setState((s) => ({ ...s, status: 'loading', error: '' }))

    api('/api/student/vocabulary', { signal })
      .then((data) => {
        if (signal.aborted) return
        setState({
          status: 'ready',
          items: normalizeItems(data?.items),
          lessons: normalizeLessons(data?.lessons),
          error: '',
        })
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || signal.aborted) return
        setState({ status: 'error', items: [], lessons: [], error: err?.message || 'Something went wrong.' })
      })

    return () => controller.abort()
  }, [reloadKey])

  const { items, lessons } = state

  // View in the URL (?mode=cards&lesson=<id>) so the lesson page can link to a deck
  // and Back from a lesson keeps it
  const mode = router.isReady && router.query.mode === 'cards' ? 'cards' : 'list'
  const lessonParam = router.isReady && typeof router.query.lesson === 'string' ? router.query.lesson : ''
  const deckLesson = lessons.find((l) => l.id === lessonParam) || null

  const setView = (next) => {
    const view = { mode, lesson: deckLesson?.id || '', ...next }
    const q = {}
    if (view.mode === 'cards') q.mode = 'cards'
    if (view.lesson) q.lesson = view.lesson
    router.replace({ pathname: '/student/vocabulary', query: q }, undefined, { shallow: true, scroll: false })
  }

  const needle = foldFrench(query)

  // The deck (lesson) only narrows the flashcards; the list is already grouped by lesson
  const scoped = useMemo(
    () => (mode === 'cards' && deckLesson ? items.filter((it) => it.lessonIds.includes(deckLesson.id)) : items),
    [items, mode, deckLesson]
  )

  const counts = useMemo(() => {
    const c = { all: scoped.length, word: 0, expression: 0 }
    for (const it of scoped) c[it.kind] += 1
    return c
  }, [scoped])

  const filtered = useMemo(
    () => scoped.filter((it) => (kind === 'all' || it.kind === kind) && (!needle || it.haystack.includes(needle))),
    [scoped, kind, needle]
  )

  const kindLabel = FILTERS.find((f) => f.value === kind)?.label.toLowerCase() || 'words'

  let body = null
  if (state.status === 'ready' && items.length > 0) {
    const chips = (
      <div className={styles.chips} role="group" aria-label="Filter">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={cx(styles.chip, kind === f.value && styles.chipActive)}
            aria-pressed={kind === f.value}
            onClick={() => setKind(f.value)}
          >
            {f.label}
            <span className={styles.chipCount}>{counts[f.value]}</span>
          </button>
        ))}
      </div>
    )

    const noMatch = (
      <div className={`${ui.card} ${styles.state}`}>
        <div className={styles.stateEmoji} aria-hidden="true">🔍</div>
        <h2 className={styles.stateTitle}>{needle ? 'No matches' : `No ${kindLabel} yet`}</h2>
        <p className={styles.stateText}>
          {needle
            ? `Nothing matches “${query.trim()}”${kind !== 'all' ? ` in ${kindLabel}` : ''}.`
            : 'Try another filter.'}
        </p>
        {needle && (
          <button type="button" className={`${ui.btn} ${ui.blue}`} onClick={() => setQuery('')}>
            Clear search
          </button>
        )}
      </div>
    )

    body =
      mode === 'list' ? (
        <>
          <div className={styles.search} role="search">
            <span className={styles.searchIcon} aria-hidden="true">🔍</span>
            <label htmlFor="vocab-search" className="sr-only">
              Search your words
            </label>
            <input
              id="vocab-search"
              type="search"
              className={styles.searchInput}
              placeholder="Search in French or English"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              enterKeyHint="search"
            />
            {query && (
              <button type="button" className={styles.searchClear} onClick={() => setQuery('')} aria-label="Clear search">
                ✕
              </button>
            )}
          </div>
          {chips}
          <p className={needle ? styles.resultCount : 'sr-only'} aria-live="polite">
            {needle ? `${filtered.length} ${filtered.length === 1 ? 'result' : 'results'}` : ''}
          </p>
          {filtered.length > 0 ? (
            <WordList
              items={filtered}
              flat={Boolean(needle)}
              speech={speech}
              onPracticeLesson={(lessonId) => {
                setView({ mode: 'cards', lesson: lessonId })
                window.scrollTo(0, 0) // the deck is at the top, the button may be far down the list
              }}
            />
          ) : (
            noMatch
          )}
        </>
      ) : (
        <>
          {lessons.length > 1 && (
            <div className={styles.deck}>
              <label htmlFor="vocab-deck" className={styles.deckLabel}>
                Deck
              </label>
              <select
                id="vocab-deck"
                className={styles.deckSelect}
                value={deckLesson?.id || ''}
                onChange={(e) => setView({ lesson: e.target.value })}
              >
                <option value="">All lessons ({items.length})</option>
                {lessons.map((l) => {
                  const date = formatLessonDate(l.date, { month: 'short', day: 'numeric' })
                  return (
                    <option key={l.id} value={l.id}>
                      {date ? `${l.title} · ${date}` : l.title}
                    </option>
                  )
                })}
              </select>
            </div>
          )}
          {chips}
          {needle && (
            <div className={styles.searchPill}>
              <span>
                <span aria-hidden="true">🔍 </span>Only cards matching “{query.trim()}”
              </span>
              <button type="button" className={`${ui.btn} ${ui.ghost} ${ui.small}`} onClick={() => setQuery('')}>
                Show all
              </button>
            </div>
          )}
          {filtered.length > 0 ? (
            <Flashcards
              key={`${deckLesson?.id || 'all'}|${kind}|${needle}`}
              items={filtered}
              speech={speech}
              direction={direction}
              onDirectionChange={setDirection}
            />
          ) : (
            noMatch
          )}
        </>
      )
  }

  return (
    <StudentShell>
      <Head>
        <title>Words · Preply Lessons</title>
      </Head>

      {state.status === 'loading' && (
        <>
          <h1 className="sr-only">Words</h1>
          <div role="status" aria-busy="true">
            <span className="sr-only">Loading your words…</span>
            <PageSkeleton />
          </div>
        </>
      )}

      {state.status === 'error' && (
        <div className={styles.page}>
          <h1 className={styles.title}>Words</h1>
          <div className={`${ui.card} ${styles.state}`} role="alert">
            <div className={styles.stateEmoji} aria-hidden="true">😵‍💫</div>
            <h2 className={styles.stateTitle}>Couldn’t load your words</h2>
            <p className={styles.stateText}>{state.error}</p>
            <button type="button" className={`${ui.btn} ${ui.blue}`} onClick={() => setReloadKey((k) => k + 1)}>
              Try again
            </button>
          </div>
        </div>
      )}

      {state.status === 'ready' && items.length === 0 && (
        <div className={styles.page}>
          <h1 className={styles.title}>Words</h1>
          <div className={`${ui.card} ${styles.state}`}>
            <div className={styles.stateEmoji} aria-hidden="true">📖</div>
            <h2 className={styles.stateTitle}>No words yet</h2>
            <p className={styles.stateText}>
              The words and expressions from your lessons will show up here after your first lesson recap.
            </p>
            <Link href="/student/lessons" className={`${ui.btn} ${ui.blue}`}>
              <span aria-hidden="true">📚</span> My lessons
            </Link>
          </div>
        </div>
      )}

      {state.status === 'ready' && items.length > 0 && (
        <div className={styles.page}>
          <div className={styles.header}>
            <div className={styles.titleWrap}>
              <h1 className={styles.title}>Words</h1>
              <p className={styles.subtitle}>
                <strong>{items.length}</strong> {items.length === 1 ? 'word & expression' : 'words & expressions'} saved
              </p>
            </div>
            <div className={styles.segmented} role="group" aria-label="View">
              {MODES.map((m) => (
                <button
                  key={m.value}
                  type="button"
                  className={cx(styles.segBtn, mode === m.value && styles.segActive)}
                  aria-pressed={mode === m.value}
                  onClick={() => mode !== m.value && setView({ mode: m.value })}
                >
                  <span aria-hidden="true">{m.icon}</span> {m.label}
                </button>
              ))}
            </div>
          </div>
          {body}
        </div>
      )}
    </StudentShell>
  )
}
