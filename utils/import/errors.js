// Error thrown by the document import helpers: a short French message meant for
// the teacher plus the HTTP status the route should answer with.
//
// No `@/` imports in utils/import on purpose: plain node can import these files
// directly for quick checks.

export class ImportError extends Error {
  constructor(message, status = 400, cause) {
    super(message)
    this.name = 'ImportError'
    this.status = status
    if (cause) this.cause = cause
  }
}

/** Sends an ImportError as `{ error }`. Returns true if `err` was one. */
export function sendImportError(res, err) {
  if (!(err instanceof ImportError)) return false
  if (err.status === 413) res.setHeader('Connection', 'close')
  res.status(err.status).json({ error: err.message })
  return true
}
