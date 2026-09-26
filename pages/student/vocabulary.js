import { useEffect, useMemo, useState } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import StudentShell from '@/components/student/StudentShell'
import WordList, { WordListSkeleton } from '@/components/student/vocabulary/WordList'
import Flashcards from '@/components/student/vocabulary/Flashcards'
import useFrenchSpeech from '@/components/student/vocabulary/useFrenchSpeech'
import { cx } from '@/components/practice/utils'
import { stripAccents } from '@/utils/lesson/grading'
import { api } from '@/utils/apiClient'
import ui from '@/components/student/ui.module.css'
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

/** Case-, accent- and apostrophe-insensitive form used for search. */
function fold(value) {
  return stripAccents(String(value || '').toLowerCase())
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeItems(raw) {
  if (!Array.isArray(raw)) return []
  const out = []
  raw.forEach((it, i) => {
    const fr = typeof it?.fr === 'string' ? it.fr.trim() : ''
    if (!fr) return
    const en = typeof it.en === 'string' ? it.en.trim() : ''
    const example = typeof it.example === 'string' ? it.example.trim() : ''
    out.push({
      key: `v${i}`,
      fr,
      en,
      example,
      kind: it.kind === 'expression' ? 'expression' : 'word',
      lessonId: it.lessonId ? String(it.lessonId) : '',
      lessonTitle: typeof it.lessonTitle === 'string' ? it.lessonTitle : '',
      lesson_date: typeof it.lesson_date === 'string' ? it.lesson_date : '',
      haystack: fold(`${fr} ${en} ${example}`),
    })
  })
  return out
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
  const [state, setState] = useState({ status: 'loading', items: [], error: '' })
  const [reloadKey, setReloadKey] = useState(0)
  const [mode, setMode] = useState('list')
  const [kind, setKind] = useState('all')
  const [query, setQuery] = useState('')
  const [deckId, setDeckId] = useState(0)
  const [direction, setDirection] = useState('fr-en')
  const speech = useFrenchSpeech()

  useEffect(() => {
    const controller = new AbortController()
    const { signal } = controller
    setState((s) => ({ ...s, status: 'loading', error: '' }))

    api('/api/student/vocabulary', { signal })
      .then((data) => {
        if (signal.aborted) return
        setState({ status: 'ready', items: normalizeItems(data?.items), error: '' })
      })
      .catch((err) => {
        if (err?.name === 'AbortError' || signal.aborted) return
        setState({ status: 'error', items: [], error: err?.message || 'Something went wrong.' })
      })

    return () => controller.abort()
  }, [reloadKey])

  const items = state.items
  const needle = fold(query)

  const counts = useMemo(() => {
    const c = { all: items.length, word: 0, expression: 0 }
    for (const it of items) c[it.kind] += 1
    return c
  }, [items])

  const filtered = useMemo(
    () => items.filter((it) => (kind === 'all' || it.kind === kind) && (!needle || it.haystack.includes(needle))),
    [items, kind, needle]
  )

  const switchMode = (next) => {
    if (next === mode) return
    if (next === 'cards') setDeckId((d) => d + 1) // fresh shuffle every time the mode is entered
    setMode(next)
  }

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
          {filtered.length > 0 ? <WordList items={filtered} flat={Boolean(needle)} speech={speech} /> : noMatch}
        </>
      ) : (
        <>
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
              key={`${deckId}|${kind}|${needle}`}
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
        <div role="status" aria-busy="true">
          <span className="sr-only">Loading your words…</span>
          <PageSkeleton />
        </div>
      )}

      {state.status === 'error' && (
        <div className={styles.page}>
          <h1 className={styles.title}>Words</h1>
          <div className={`${ui.card} ${styles.state}`} role="alert">
            <div className={styles.stateEmoji} aria-hidden="true">😵‍💫</div>
            <h2 className={styles.stateTitle}>Couldn&apos;t load your words</h2>
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
                  onClick={() => switchMode(m.value)}
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
