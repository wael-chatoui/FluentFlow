// Limits of the document import, shared by the import page and the API routes
// (no server-only imports: safe in the browser). Text and generation-option bounds
// come from utils/ai/options.js so the AI pipeline and the import agree.
import { GENERATION_LIMITS, MAX_DOCUMENT, MIN_DOCUMENT } from '@/utils/ai/options'

export { GENERATION_LIMITS }

export const IMPORT_LIMITS = Object.freeze({
  /** Documents per import (one lesson each). */
  maxSources: 20,
  /** Uploaded file (PDF sent to /api/teacher/import/extract, or .txt/.md read in the browser). */
  maxFileBytes: 4 * 1024 * 1024,
  /** File downloaded from Google by /api/teacher/import/resolve. */
  maxDownloadBytes: 15 * 1024 * 1024,
  /** Document text, in characters after trim (same rule as the lesson import route). */
  minText: MIN_DOCUMENT,
  maxText: MAX_DOCUMENT,
  /** `sourceName` accepted by POST /api/teacher/lessons/import. */
  maxSourceName: 200,
  /** Lesson title (same as the lessons API). */
  maxTitle: 120,
  /** Pasted link. */
  maxLinkLength: 2000,
})

/** '4 Mo' style label of a byte limit, for the French UI. */
export function megabytes(bytes) {
  return `${Math.round(bytes / (1024 * 1024))} Mo`
}
