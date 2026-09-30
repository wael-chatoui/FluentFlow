// Request guard shared by the back-office write routes.
import { HttpError } from '@/utils/api/errors'

/**
 * Writes accept JSON bodies only. A page on another site (or on another subdomain)
 * cannot send application/json without a CORS preflight, which these routes never
 * allow, so this also blocks cross-site request forgery (a plain HTML form can only
 * send urlencoded / multipart / text bodies). A DELETE without a body is accepted:
 * forms cannot send DELETE at all.
 * @throws {HttpError} 415
 */
export function assertJsonBody(req) {
  if (req.method === 'GET' || req.method === 'HEAD') return
  const type = String(req.headers?.['content-type'] || '').split(';')[0].trim().toLowerCase()
  if (type === 'application/json') return
  const length = Number(req.headers?.['content-length'] || 0)
  if (req.method === 'DELETE' && !type && !length) return
  throw new HttpError(415, 'Format de requête refusé : les données doivent être envoyées en JSON.', 'unsupported_media_type')
}
