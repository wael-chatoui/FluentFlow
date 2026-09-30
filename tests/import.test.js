import { describe, expect, it, vi } from 'vitest'
import { detectLessonDate, findDate, titleFromName } from '@/utils/import/detect'
import { LINK_MESSAGES, parseGoogleLink } from '@/utils/import/googleLinks'
import { buildFetchUrl, isAllowedHost, MESSAGES, resolveGoogleLink } from '@/utils/import/google'
import { cleanImportedText, prepareImportText, sanitizeSourceName } from '@/utils/import/text'
import { IMPORT_LIMITS } from '@/utils/import/limits'
import { canRetry, dateError, isReady, newRow, sourceNameFor } from '@/components/teacher/import/rows'
import { readQueue, serializeQueue, writeQueue } from '@/components/teacher/import/importSession'

const today = new Date(2026, 8, 30) // 30 Sept 2026
const opts = { today }
const DOC_ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz_0123456789'

describe('findDate', () => {
  it.each([
    ['Rebecca_L07_2025-03-12.pdf', '2025-03-12'],
    ['Bilan 12/03/2025', '2025-03-12'],
    ['Bilan_12-03-2025', '2025-03-12'],
    ['12.03.2025 cours', '2025-03-12'],
    ['Cours du 12 mars 2025', '2025-03-12'],
    ['Cours du 1er mars 2025', '2025-03-01'],
    ['mardi 4 février 2025', '2025-02-04'],
    ['12 déc. 2024', '2024-12-12'],
    ['Lesson of March 12, 2025', '2025-03-12'],
    ['Mar 5 2025', '2025-03-05'],
    ['12 March 2025', '2025-03-12'],
    ['le 12/03/25', '2025-03-12'],
  ])('%s → %s', (value, expected) => {
    expect(findDate(value, opts)?.date).toBe(expected)
  })

  it('ignores impossible, too old and future dates', () => {
    expect(findDate('31/02/2025', opts)).toBeNull()
    expect(findDate('né le 12/03/1990', opts)).toBeNull()
    expect(findDate('prochain cours 12/03/2027', opts)).toBeNull()
  })

  it('does not read a lesson number as a day', () => {
    expect(findDate('Rebecca_L07_Mars_2025', opts)).toBeNull()
    expect(findDate('Rebecca_L07-03-2025', opts)).toBeNull()
  })

  it('keeps the first date and locates it', () => {
    const found = findDate('Cours du 12/03/2025, prochain le 19/03/2025', opts)
    expect(found.date).toBe('2025-03-12')
    expect('Cours du 12/03/2025, prochain le 19/03/2025'.slice(found.start, found.end)).toBe('12/03/2025')
  })
})

describe('detectLessonDate', () => {
  it('prefers the name, then the first lines of the text', () => {
    expect(detectLessonDate({ name: 'Bilan_2025-03-12.pdf', text: 'Cours du 1 avril 2025' }, opts)).toEqual({
      date: '2025-03-12',
      from: 'name',
    })
    expect(detectLessonDate({ name: 'Bilan.pdf', text: '\n\nBilan du cours\nDate : 1 avril 2025\n…' }, opts)).toEqual({
      date: '2025-04-01',
      from: 'text',
    })
  })

  it('only looks at the beginning of the text', () => {
    const body = `${'ligne\n'.repeat(40)}Cours du 12/03/2025`
    expect(detectLessonDate({ name: 'Bilan.pdf', text: body }, opts)).toBeNull()
  })

  it('returns null when nothing is found', () => {
    expect(detectLessonDate({ name: 'Bilan.pdf', text: 'Vocabulaire' }, opts)).toBeNull()
    expect(detectLessonDate({}, opts)).toBeNull()
  })
})

describe('titleFromName', () => {
  const rebecca = { full_name: 'Rebecca Jones', email: 'rebecca.j@example.com' }

  it('turns "Rebecca_L07_Vouloir-Vocab.pdf" into "Leçon 7 — Vouloir vocab"', () => {
    expect(titleFromName('Rebecca_L07_Vouloir-Vocab.pdf', rebecca, opts)).toEqual({
      title: 'Leçon 7 — Vouloir vocab',
      lessonNumber: 7,
    })
  })

  it('handles two lessons in one document', () => {
    expect(titleFromName('Kiren_L02_L03.pdf', { full_name: 'Kiren' }, opts)).toEqual({
      title: 'Leçons 2 et 3',
      lessonNumber: 2,
    })
  })

  it('drops dates, generic words and "Copie de"', () => {
    expect(titleFromName('Bilan du 12 mars 2025.pdf', rebecca, opts).title).toBe('')
    expect(titleFromName('Copie de Rebecca_L12_Passe-Compose_2025-03-12.pdf', rebecca, opts).title).toBe(
      'Leçon 12 — Passe compose'
    )
    expect(titleFromName('Rebecca_Bilan.pdf', rebecca, opts).title).toBe('')
  })

  it('never uses the import fallback names as a title (the AI proposes one)', () => {
    for (const name of ['Google Doc', 'Fichier Google Drive', 'Fichier Drive', 'Document PDF', 'Document texte', 'Document']) {
      expect(titleFromName(name, null, opts).title).toBe('')
    }
  })

  it('keeps acronyms and natural titles', () => {
    expect(titleFromName('L3_Pronoms-COD.pdf', null, opts).title).toBe('Leçon 3 — Pronoms COD')
    expect(titleFromName('Leçon 7 - Le subjonctif', null, opts)).toEqual({ title: 'Leçon 7 — Le subjonctif', lessonNumber: 7 })
    expect(titleFromName('Les verbes pronominaux.pdf', null, opts)).toEqual({ title: 'Les verbes pronominaux', lessonNumber: null })
  })

  it('does not take words for lesson numbers', () => {
    expect(titleFromName('Level 2 recap.pdf', null, opts).lessonNumber).toBeNull()
    expect(titleFromName('Lyon_trip.pdf', null, opts)).toEqual({ title: 'Lyon trip', lessonNumber: null })
  })

  it('caps the title length', () => {
    expect(titleFromName(`${'a'.repeat(300)}.pdf`, null, opts).title.length).toBe(IMPORT_LIMITS.maxTitle)
  })
})

describe('parseGoogleLink', () => {
  it('accepts Docs links (with or without scheme, http upgraded, /u/0)', () => {
    for (const link of [
      `https://docs.google.com/document/d/${DOC_ID}/edit?usp=sharing`,
      `docs.google.com/document/d/${DOC_ID}`,
      `http://docs.google.com/document/u/0/d/${DOC_ID}/edit`,
      `<https://docs.google.com/document/d/${DOC_ID}/edit>`,
    ]) {
      expect(parseGoogleLink(link)).toMatchObject({
        kind: 'doc',
        id: DOC_ID,
        url: `https://docs.google.com/document/d/${DOC_ID}/edit`,
        dedupeKey: `google:${DOC_ID}`,
      })
    }
  })

  it('accepts Drive file links and keeps the resource key', () => {
    expect(parseGoogleLink(`https://drive.google.com/file/d/${DOC_ID}/view?usp=drive_link`)).toMatchObject({
      kind: 'drive',
      id: DOC_ID,
    })
    expect(parseGoogleLink(`https://drive.google.com/open?id=${DOC_ID}`)).toMatchObject({ kind: 'drive', id: DOC_ID })
    expect(parseGoogleLink(`https://drive.google.com/uc?id=${DOC_ID}&export=download`)).toMatchObject({ kind: 'drive' })
    expect(parseGoogleLink(`https://drive.google.com/file/d/${DOC_ID}/view?resourcekey=0-abcDEF`)).toMatchObject({
      resourceKey: '0-abcDEF',
      url: `https://drive.google.com/file/d/${DOC_ID}/view?resourcekey=0-abcDEF`,
    })
  })

  it('explains what is not supported', () => {
    expect(parseGoogleLink('')).toEqual({ error: LINK_MESSAGES.empty })
    expect(parseGoogleLink(`https://docs.google.com/document/d/e/${DOC_ID}/pub`)).toEqual({ error: LINK_MESSAGES.published })
    expect(parseGoogleLink(`https://docs.google.com/spreadsheets/d/${DOC_ID}/edit`)).toEqual({ error: LINK_MESSAGES.unsupported })
    expect(parseGoogleLink(`https://drive.google.com/drive/folders/${DOC_ID}`)).toEqual({ error: LINK_MESSAGES.folder })
    expect(parseGoogleLink('https://drive.google.com/drive/my-drive')).toEqual({ error: LINK_MESSAGES.page })
    expect(parseGoogleLink('https://docs.google.com/document/u/0/')).toEqual({ error: LINK_MESSAGES.page })
    expect(parseGoogleLink(`https://evil.example.com/document/d/${DOC_ID}`)).toEqual({ error: LINK_MESSAGES.host })
    expect(parseGoogleLink(`https://docs.google.com.evil.com/document/d/${DOC_ID}`)).toEqual({ error: LINK_MESSAGES.host })
  })

  it('rejects malformed links', () => {
    for (const link of [
      'javascript:alert(1)',
      `ftp://docs.google.com/document/d/${DOC_ID}`,
      `https://user:pw@docs.google.com/document/d/${DOC_ID}`,
      `https://docs.google.com:8443/document/d/${DOC_ID}`,
      'https://docs.google.com/document/d/short',
      `https://docs.google.com/document/d/${DOC_ID}%2F..%2F/edit`,
      `https://docs.google.com/document/d/${'a'.repeat(2100)}`,
    ]) {
      expect(parseGoogleLink(link)).toHaveProperty('error')
    }
  })
})

describe('buildFetchUrl / isAllowedHost', () => {
  it('builds the download URL from the id only', () => {
    expect(buildFetchUrl({ kind: 'doc', id: DOC_ID })).toBe(`https://docs.google.com/document/d/${DOC_ID}/export?format=txt`)
    expect(buildFetchUrl({ kind: 'drive', id: DOC_ID, resourceKey: '0-k' })).toBe(
      `https://drive.google.com/uc?export=download&id=${DOC_ID}&resourcekey=0-k`
    )
  })

  it('allows Google download hosts only', () => {
    expect(isAllowedHost('drive.usercontent.google.com')).toBe(true)
    expect(isAllowedHost('doc-0s-4g-docs.googleusercontent.com')).toBe(true)
    expect(isAllowedHost('evil.com')).toBe(false)
    expect(isAllowedHost('googleusercontent.com.evil.com')).toBe(false)
    expect(isAllowedHost('accounts.google.com')).toBe(false)
  })
})

// Minimal Response stand-in with a cancellable body
function fakeResponse(status, { headers = {}, body = '' } = {}) {
  const cancel = vi.fn(() => Promise.resolve())
  const bytes = new TextEncoder().encode(body)
  let sent = false
  const lower = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]))
  return {
    status,
    ok: status >= 200 && status < 300,
    headers: { get: (name) => lower[name.toLowerCase()] ?? null },
    body: {
      cancel,
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true }
          sent = true
          return { done: false, value: bytes }
        },
        cancel: async () => {},
      }),
    },
  }
}

const LESSON_TEXT = `Bilan du cours\n\n${'Le subjonctif présent sert à exprimer un souhait. '.repeat(10)}`

describe('resolveGoogleLink', () => {
  it('follows redirects to Google hosts by hand', async () => {
    const calls = []
    const fetchImpl = vi.fn(async (url, init) => {
      calls.push(url)
      expect(init.redirect).toBe('manual')
      if (calls.length === 1) return fakeResponse(307, { headers: { location: 'https://doc-0s-docs.googleusercontent.com/export/x' } })
      return fakeResponse(200, {
        headers: { 'content-type': 'text/plain; charset=utf-8', 'content-disposition': 'attachment; filename="Le%C3%A7on.txt"; filename*=UTF-8\'\'Le%C3%A7on%207.txt' },
        body: LESSON_TEXT,
      })
    })
    const result = await resolveGoogleLink(`https://docs.google.com/document/d/${DOC_ID}/edit`, { fetchImpl })
    expect(calls[0]).toBe(`https://docs.google.com/document/d/${DOC_ID}/export?format=txt`)
    expect(result).toMatchObject({ sourceName: 'Leçon 7', pages: null, warning: null })
    expect(result.text).toContain('subjonctif')
  })

  it('refuses redirects outside Google and releases the response', async () => {
    const redirect = fakeResponse(302, { headers: { location: 'https://evil.example.com/steal' } })
    const fetchImpl = vi.fn(async () => redirect)
    await expect(resolveGoogleLink(`https://docs.google.com/document/d/${DOC_ID}`, { fetchImpl })).rejects.toThrow(MESSAGES.redirect)
    expect(redirect.body.cancel).toHaveBeenCalled()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('reports the sign-in redirect of a private document as "not public"', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse(302, { headers: { location: 'https://accounts.google.com/ServiceLogin' } }))
    await expect(resolveGoogleLink(`https://docs.google.com/document/d/${DOC_ID}`, { fetchImpl })).rejects.toThrow(MESSAGES.notPublic)
  })

  it('stops after 5 redirects', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse(302, { headers: { location: 'https://drive.google.com/loop' } }))
    await expect(resolveGoogleLink(`https://docs.google.com/document/d/${DOC_ID}`, { fetchImpl })).rejects.toThrow(MESSAGES.upstream)
    expect(fetchImpl).toHaveBeenCalledTimes(6)
  })

  it('cancels the body of error responses', async () => {
    const denied = fakeResponse(403, { body: 'no' })
    await expect(
      resolveGoogleLink(`https://docs.google.com/document/d/${DOC_ID}`, { fetchImpl: async () => denied })
    ).rejects.toThrow(MESSAGES.notPublic)
    expect(denied.body.cancel).toHaveBeenCalled()
  })

  it('falls back to the Docs export for a native Google Doc behind a Drive link', async () => {
    const fetchImpl = vi.fn(async (url) =>
      url.startsWith('https://drive.google.com/uc')
        ? fakeResponse(200, { headers: { 'content-type': 'text/html' }, body: '<html>' })
        : fakeResponse(200, { headers: { 'content-type': 'text/plain' }, body: LESSON_TEXT })
    )
    const result = await resolveGoogleLink(`https://drive.google.com/open?id=${DOC_ID}`, { fetchImpl })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(result.sourceName).toBe('Google Doc')
    expect(result.text).toContain('subjonctif')
  })

  it('reads a Drive .md served as octet-stream and explains unsupported file types', async () => {
    const md = vi.fn(async () =>
      fakeResponse(200, {
        headers: { 'content-type': 'application/octet-stream', 'content-disposition': 'attachment; filename="Bilan L3.md"' },
        body: LESSON_TEXT,
      })
    )
    const result = await resolveGoogleLink(`https://drive.google.com/file/d/${DOC_ID}/view`, { fetchImpl: md })
    expect(result).toMatchObject({ sourceName: 'Bilan L3.md', pages: null })
    const docx = vi.fn(async () =>
      fakeResponse(200, {
        headers: {
          'content-type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'content-disposition': 'attachment; filename="Bilan.docx"',
        },
        body: 'PK',
      })
    )
    await expect(resolveGoogleLink(`https://drive.google.com/file/d/${DOC_ID}/view`, { fetchImpl: docx })).rejects.toThrow(
      MESSAGES.fileType
    )
  })

  it('keeps the Drive error when the Docs export fails too', async () => {
    const fetchImpl = vi.fn(async () => fakeResponse(404))
    await expect(resolveGoogleLink(`https://drive.google.com/file/d/${DOC_ID}/view`, { fetchImpl })).rejects.toThrow(MESSAGES.notFound)
  })
})

describe('cleanImportedText', () => {
  it('drops page numbers and repeated print headers, by position only', () => {
    const pages = [1, 2, 3].map(
      (n) => `12/03/2025 14:05 Bilan\nVocabulaire\nmot ${n}\n${n === 2 ? 'Vocabulaire\nautre mot\n' : ''}https://docs.google.com/document/d/x ${n}/3`
    )
    const text = cleanImportedText(pages)
    expect(text).not.toContain('14:05')
    expect(text).not.toContain('https://')
    // Headings repeated at the top of each page are content, and so is the mid-page one
    expect(text.match(/Vocabulaire/g)).toHaveLength(4)
  })

  it('keeps years and dates that look like page counters', () => {
    const pages = ['2024\nIntro', 'Suite\n03/2024', 'Fin\n12/03']
    const text = cleanImportedText(pages)
    expect(text).toContain('2024')
    expect(text).toContain('03/2024')
    expect(text).toContain('12/03')
  })

  it('drops "Page n" and "n / m" counters on multi-page documents', () => {
    expect(cleanImportedText(['Un\nPage 1', 'Deux\n2 / 2'])).toBe('Un\n\nDeux')
    expect(cleanImportedText('Seul\n3')).toBe('Seul\n3')
  })
})

describe('prepareImportText', () => {
  it('warns about truncation', () => {
    const long = 'mot '.repeat(IMPORT_LIMITS.maxText)
    const { text, warning } = prepareImportText(long)
    expect(text.length).toBeLessThanOrEqual(IMPORT_LIMITS.maxText)
    expect(warning).toMatch(/tronqué/)
  })

  it('warns when most pages have no text', () => {
    const pages = [LESSON_TEXT, '', ' 2 ', '', '']
    expect(prepareImportText(pages).warning).toMatch(/4 sur 5/)
    expect(prepareImportText([LESSON_TEXT, LESSON_TEXT]).warning).toBeNull()
  })

  it('uses the low-text warning for almost empty documents', () => {
    expect(prepareImportText('abc', { lowText: 'vide' }).warning).toBe('vide')
  })
})

describe('sanitizeSourceName', () => {
  it('keeps a clean basename of at most 200 characters', () => {
    expect(sanitizeSourceName('C:\\Users\\x\\Bilan "1".pdf')).toBe('Bilan 1.pdf')
    expect(sanitizeSourceName('a'.repeat(250))).toHaveLength(IMPORT_LIMITS.maxSourceName)
    expect(sanitizeSourceName('   ', 'Document')).toBe('Document')
  })
})

describe('import rows', () => {
  const ready = (patch) =>
    newRow({ kind: 'pdf', sourceName: 'Bilan.pdf', extract: 'done', text: 'x'.repeat(300), lessonDate: '2025-03-12', ...patch })

  it('needs a past date, and only idle rows are imported by the main button', () => {
    expect(dateError(ready({ lessonDate: '' }))).toMatch(/date/)
    expect(dateError(ready({ lessonDate: '2999-01-01' }))).toMatch(/futur/)
    expect(isReady(ready())).toBe(true)
    expect(isReady(ready({ run: 'failed' }))).toBe(false)
    expect(isReady(ready({ lessonId: '11111111-1111-4111-8111-111111111111' }))).toBe(false)
  })

  it('retries a failed lesson by id, or the document when it can be sent again', () => {
    expect(canRetry(ready({ run: 'failed' }))).toBe(true)
    expect(canRetry(ready({ run: 'failed', text: '' }))).toBe(false)
    expect(canRetry(ready({ run: 'failed', text: '', restored: true, lessonId: '11111111-1111-4111-8111-111111111111' }))).toBe(true)
    expect(canRetry(ready({ run: 'published' }))).toBe(false)
  })

  it('sends a clean source name of at most 200 characters', () => {
    expect(sourceNameFor(ready({ sourceName: `${'a'.repeat(250)}.pdf` }))).toHaveLength(IMPORT_LIMITS.maxSourceName)
    expect(sourceNameFor(newRow({ kind: 'link', label: 'Google Doc' }))).toBe('Google Doc')
  })
})

describe('import queue (sessionStorage)', () => {
  const STUDENT = '22222222-2222-4222-8222-222222222222'
  const LESSON = '33333333-3333-4333-8333-333333333333'
  const store = new Map()
  vi.stubGlobal('window', {
    sessionStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k),
    },
  })

  it('keeps created lessons, re-extracts links and asks to add files again (same clientKey)', () => {
    const rows = [
      newRow({ kind: 'pdf', sourceName: 'L1.pdf', dedupeKey: 'file:L1', text: 'secret', run: 'published', lessonId: LESSON, title: 'Leçon 1' }),
      newRow({ kind: 'pdf', sourceName: 'L2.pdf', dedupeKey: 'file:L2', text: 'secret', run: 'generating', lessonId: LESSON }),
      newRow({ kind: 'pdf', sourceName: 'L3.pdf', dedupeKey: 'file:L3', text: 'secret', run: 'sending', sent: true, lessonDate: '2025-01-02' }),
      newRow({ kind: 'link', url: 'https://docs.google.com/document/d/x/edit', dedupeKey: 'google:x', label: 'Google Doc', text: 'secret' }),
    ]
    const serialized = serializeQueue(STUDENT, rows, [], (r) => r.title || '')
    expect(serialized).not.toContain('secret') // never the document text
    writeQueue(serialized)
    const q = readQueue()
    expect(q.studentId).toBe(STUDENT)
    expect(q.rows.map((r) => [r.sourceName || r.label, r.run, r.restored])).toEqual([
      ['L1.pdf', 'published', true],
      ['L2.pdf', 'generating', true],
      ['Google Doc', 'idle', false],
    ])
    expect(q.rows[2]).toMatchObject({ extract: 'pending', clientKey: rows[3].clientKey })
    expect(q.orphans).toEqual([
      expect.objectContaining({ dedupeKey: 'file:L3', clientKey: rows[2].clientKey, sent: true, lessonDate: '2025-01-02' }),
    ])
  })

  it('ignores malformed ids and old queues', () => {
    const row = newRow({ kind: 'pdf', dedupeKey: 'file:a', run: 'published', lessonId: LESSON })
    writeQueue(serializeQueue(STUDENT, [{ ...row, lessonId: '../../admin' }], [], () => ''))
    expect(readQueue().rows).toEqual([])
    const old = JSON.parse(serializeQueue(STUDENT, [row], [], () => ''))
    writeQueue(JSON.stringify({ ...old, savedAt: Date.now() - 2 * 24 * 3600 * 1000 }))
    expect(readQueue()).toBeNull()
  })
})
