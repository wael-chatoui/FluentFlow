// Browser-side fetch wrapper for our own API routes.
// Auth travels in the Supabase cookies, so no token handling is needed here.

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

/**
 * @param {string} path  e.g. '/api/student/lessons'
 * @param {{ method?: string, body?: unknown, signal?: AbortSignal }} [options]
 * @returns {Promise<any>} parsed JSON body
 * @throws {ApiError} with the server's `error` message on non-2xx responses
 */
export async function api(path, { method = 'GET', body, signal } = {}) {
  let res
  try {
    res = await fetch(path, {
      method,
      signal,
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    if (err.name === 'AbortError') throw err
    throw new ApiError('Network error — check your connection and try again.', 0)
  }

  const data = await res.json().catch(() => ({}))
  if (!res.ok) {
    if (res.status === 401 && typeof window !== 'undefined') {
      window.location.href = '/login'
    }
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status)
  }
  return data
}
