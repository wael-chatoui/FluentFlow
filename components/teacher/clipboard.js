// Clipboard helpers for the teacher pages. The async Clipboard API needs a secure
// context (https or localhost) and, for reading, the user's permission: both
// functions degrade gracefully instead of throwing.

/** Copies `text`; resolves true on success. Falls back to execCommand('copy'). */
export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Permission denied or insecure context: try the legacy way below
  }
  const previous = document.activeElement
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    // Inside an open modal <dialog> the rest of the page is inert (nothing there can be selected)
    const host = previous?.closest?.('dialog[open]') || document.body
    host.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  } finally {
    // select() moved the focus: give it back to the button that was used
    if (previous && previous !== document.activeElement && typeof previous.focus === 'function') {
      previous.focus({ preventScroll: true })
    }
  }
}

/**
 * Clipboard text: '' when the clipboard holds no text (empty, or only an image), null when
 * reading is not possible (unsupported, refused, insecure context).
 */
export async function readClipboardText() {
  try {
    if (!navigator.clipboard?.readText) return null
    const text = await navigator.clipboard.readText()
    return typeof text === 'string' ? text : ''
  } catch {
    return null
  }
}
