// POST /api/teacher/import/extract — raw PDF body (Content-Type: application/pdf, max 4 MB,
// header X-File-Name URI-encoded) → { sourceName, text, pages, warning }
import { allowMethods, requireTeacher } from '@/utils/auth/server'
import { handleError } from '@/utils/api/errors'
import { ImportError, sendImportError } from '@/utils/import/errors'
import { extractPdfText, isPdf } from '@/utils/import/pdf'
import { sanitizeSourceName } from '@/utils/import/text'

export const config = { api: { bodyParser: false }, maxDuration: 60 }

const MAX_BYTES = 4 * 1024 * 1024
const TOO_LARGE = 'Fichier trop volumineux (4 Mo max).'

// Reads the raw request body, rejecting as soon as it exceeds maxBytes
function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    if (Number(req.headers['content-length']) > maxBytes) {
      reject(new ImportError(TOO_LARGE, 413))
      return
    }
    const chunks = []
    let size = 0
    let done = false
    const finish = (err, value) => {
      if (done) return
      done = true
      req.off('data', onData)
      if (err) {
        // Keep draining (and discarding) the rest so the response can still be sent
        req.resume()
        reject(err)
      } else resolve(value)
    }
    const onData = (chunk) => {
      size += chunk.length
      if (size > maxBytes) finish(new ImportError(TOO_LARGE, 413))
      else chunks.push(chunk)
    }
    req.on('data', onData)
    req.on('end', () => finish(null, Buffer.concat(chunks, size)))
    req.on('error', (err) => finish(err))
  })
}

function fileName(header) {
  const raw = Array.isArray(header) ? header[0] : header
  let name = ''
  try {
    name = raw ? decodeURIComponent(raw) : ''
  } catch {
    name = String(raw || '')
  }
  return sanitizeSourceName(name, 'Document PDF')
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['POST'])) return
  if (!(await requireTeacher(req, res))) {
    req.resume()
    return
  }

  try {
    const buffer = await readBody(req, MAX_BYTES)
    if (!buffer.length) return res.status(400).json({ error: 'Aucun fichier reçu.' })
    if (!isPdf(buffer)) return res.status(400).json({ error: "Ce fichier n'est pas un PDF." })

    const { text, pages, warning } = await extractPdfText(buffer)
    return res.status(200).json({ sourceName: fileName(req.headers['x-file-name']), text, pages, warning })
  } catch (err) {
    if (sendImportError(res, err)) {
      if (err.status >= 500 || err.cause) console.error('[api] teacher/import/extract:', err.cause || err)
      return
    }
    return handleError(res, err, 'teacher/import/extract', 'fr')
  }
}
