// PDF → text with unpdf (pdf.js build without a worker, fine on Vercel). Server only.
import { extractText, getDocumentProxy } from 'unpdf'
import { ImportError } from '@/utils/import/errors'
import { prepareImportText } from '@/utils/import/text'

const MAGIC = '%PDF-'
const MAGIC_WINDOW = 1024 // readers accept a little junk before the header

/** True if the buffer looks like a PDF (%PDF- in the first bytes). */
export function isPdf(buffer) {
  if (!buffer || buffer.length < MAGIC.length) return false
  const head = Buffer.from(buffer.subarray(0, MAGIC_WINDOW)).toString('latin1')
  return head.includes(MAGIC)
}

/**
 * Extracts and cleans the text of a PDF.
 * @param {Buffer|Uint8Array} buffer
 * @returns {Promise<{ text: string, pages: number, warning: string|null }>}
 *   `warning`: French note when the text looks scanned or was truncated
 * @throws {ImportError} not a PDF, protected or unreadable
 */
export async function extractPdfText(buffer) {
  if (!isPdf(buffer)) throw new ImportError("Ce fichier n'est pas un PDF.")

  let pdf
  try {
    // Copy: pdf.js may detach the array it is given
    pdf = await getDocumentProxy(new Uint8Array(buffer), { verbosity: 0 })
    const { text, totalPages } = await extractText(pdf, { mergePages: false })
    const { text: cleaned, warning } = prepareImportText(Array.isArray(text) ? text : [text])
    return { text: cleaned, pages: totalPages, warning }
  } catch (err) {
    if (err?.name === 'PasswordException') {
      throw new ImportError('Ce PDF est protégé par un mot de passe : enregistre-le sans protection puis réessaie.', 400, err)
    }
    throw new ImportError('Impossible de lire ce PDF (fichier endommagé ou format non pris en charge).', 400, err)
  } finally {
    // Frees pdf.js resources (method name depends on the pdf.js build)
    try {
      await (pdf?.destroy || pdf?.cleanup)?.call(pdf)
    } catch {
      // ignore
    }
  }
}
