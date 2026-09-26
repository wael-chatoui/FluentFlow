// Input validation for API routes. Each helper returns the cleaned value,
// `undefined` when the field was not sent, or throws a BadRequest with `message`.
import { UUID_RE } from '@/utils/auth/server'
import { LEVELS, safeDriveUrl } from '@/utils/lesson/schema'
import { fail } from '@/utils/api/errors'

export const LIMITS = {
  source: 150_000, // transcript / Canva notes
  title: 120,
  fullName: 120,
  profileText: 1000, // goals / interests
  notes: 10_000,
}

export const isUuid = (value) => typeof value === 'string' && UUID_RE.test(value)

/** Request body as an object ({} when missing or not an object). */
export function bodyOf(req) {
  const body = req.body
  return body && typeof body === 'object' && !Array.isArray(body) ? body : {}
}

/** Optional string: null → '', trimmed, at most `max` chars. */
export function optionalText(value, max, message) {
  if (value === undefined) return undefined
  if (value === null) return ''
  if (typeof value !== 'string' || value.length > max) fail(message)
  return value.trim()
}

export function optionalLevel(value, message) {
  if (value === undefined) return undefined
  if (!LEVELS.includes(value)) fail(message)
  return value
}

/** Real calendar date written YYYY-MM-DD. */
export function isIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
}

/** '' or null clears the link (→ null); anything else must be an https Google Drive URL. */
export function optionalDriveUrl(value, message) {
  if (value === undefined) return undefined
  if (value === null || (typeof value === 'string' && !value.trim())) return null
  const url = typeof value === 'string' ? safeDriveUrl(value) : ''
  if (!url) fail(message)
  return url
}

/** At least `min` non-space characters. */
export function hasEnoughText(value, min = 20) {
  return typeof value === 'string' && value.replace(/\s/g, '').length >= min
}
