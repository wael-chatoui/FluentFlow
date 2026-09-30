// Runs work after the API response is sent (e.g. a 30–120 s AI generation), so the
// browser gets the lesson id right away and can leave the page.
//
// On Vercel the platform exposes waitUntil() through a global request context: it
// keeps the function alive until the promise settles (bounded by the route's
// maxDuration). With `next start` / `next dev` the Node process keeps running
// anyway. Errors are logged, never thrown (the caller already answered).

function platformWaitUntil() {
  for (const key of ['@vercel/request-context', '@next/request-context']) {
    const ctx = globalThis[Symbol.for(key)]?.get?.()
    if (typeof ctx?.waitUntil === 'function') return ctx.waitUntil.bind(ctx)
  }
  return null
}

/**
 * @param {() => Promise<unknown>} task
 * @param {string} context  label for the error log
 */
export function runInBackground(task, context) {
  const promise = Promise.resolve()
    .then(task)
    .catch((err) => console.error(`[background] ${context}:`, err))
  const waitUntil = platformWaitUntil()
  if (waitUntil) waitUntil(promise)
  return promise
}
