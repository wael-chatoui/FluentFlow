// Error helpers for API routes: validation errors become 400 with a readable
// message, anything else is logged and returned as a generic 500.
import { serverError } from '@/utils/auth/server'

export class BadRequest extends Error {}

/** Throws a BadRequest (sent as 400 by handleError). */
export function fail(message) {
  throw new BadRequest(message)
}

/**
 * Sends 400 for BadRequest, a generic 500 otherwise (never the raw error).
 * @param {'en'|'fr'} lang  English for student routes, French for teacher routes
 */
export function handleError(res, err, context, lang = 'en') {
  if (err instanceof BadRequest) return res.status(400).json({ error: err.message })
  if (lang !== 'fr') return serverError(res, err, context)
  console.error(`[api] ${context}:`, err)
  return res.status(500).json({ error: 'Une erreur est survenue. Réessaie dans un instant.' })
}
