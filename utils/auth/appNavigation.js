// Tells whether the current page was reached from inside the app. A page mounted after
// the app's first page was reached by a client-side navigation, which only the app's
// own links and code can start; the first page of a page load may have been opened
// from any site. pages/_app.js marks the start once its first page has mounted.
let started = false

export function markAppStarted() {
  started = true
}

/** Call during the page's first render (e.g. a useState initializer). */
export function reachedFromApp() {
  return started
}
