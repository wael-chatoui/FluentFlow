// Student lookups for teacher routes. A "student" is an auth user without the teacher
// role and without the admin flag (both live in app_metadata); "pending" = self sign-up
// waiting for approval.
import { getRole, isAdmin, isApproved } from '@/utils/auth/server'

const AUTH_PAGE = 1000
const MAX_AUTH_PAGES = 20
const ROWS_PAGE = 1000
const MAX_ROWS = 50_000

/** Every auth user in one listUsers pass, as a Map id → user. */
export async function authUsersById(admin) {
  const users = new Map()
  for (let page = 1; page <= MAX_AUTH_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: AUTH_PAGE })
    if (error) throw error
    const batch = data?.users || []
    for (const u of batch) users.set(u.id, u)
    if (batch.length < AUTH_PAGE) break
  }
  return users
}

/** Auth user by id, or null when it does not exist. */
export async function getAuthUser(admin, id) {
  const { data, error } = await admin.auth.admin.getUserById(id)
  if (error && error.status !== 404 && !/not.?found/i.test(error.message || '')) throw error
  return data?.user || null
}

/** Auth user with this email (compared lower-cased), or null. Scans the user list. */
export async function findAuthUserByEmail(admin, email) {
  const target = String(email || '').trim().toLowerCase()
  if (!target) return null
  for (let page = 1; page <= MAX_AUTH_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: AUTH_PAGE })
    if (error) throw error
    const batch = data?.users || []
    const found = batch.find((u) => String(u.email || '').toLowerCase() === target)
    if (found) return found
    if (batch.length < AUTH_PAGE) break
  }
  return null
}

/**
 * Account the teacher area may manage. An admin is never one, whatever its role: the
 * back office allows an admin with role 'student', and a teacher who could read, edit
 * or get a sign-in link for that account would get its back-office access.
 */
export const isStudentUser = (user) => Boolean(user) && getRole(user) === 'student' && !isAdmin(user)

/** Self sign-up account waiting for the teacher's approval. */
export const isPendingUser = (user) => isStudentUser(user) && !isApproved(user)

/** Account fields shown to the teacher: { approved, last_sign_in_at, email_confirmed }. */
export function accountFields(user) {
  return {
    approved: isApproved(user),
    last_sign_in_at: user?.last_sign_in_at || null,
    email_confirmed: Boolean(user?.email_confirmed_at || user?.confirmed_at),
  }
}

/** Sign-in provider of an account ('google', 'email'…), for the pending list. */
export function providerOf(user) {
  const provider = user?.app_metadata?.provider || user?.identities?.[0]?.provider
  return typeof provider === 'string' ? provider : 'email'
}

/** True if `id` is an existing student account (see isStudentUser). */
export async function isStudentAccount(admin, id) {
  return isStudentUser(await getAuthUser(admin, id))
}

/**
 * True if `id` is a student who can receive lessons: a profile, a student account,
 * approved (pending self sign-ups cannot).
 */
export async function isExistingStudent(admin, id) {
  const [profile, user] = await Promise.all([
    admin.from('profiles').select('id').eq('id', id).maybeSingle(),
    getAuthUser(admin, id),
  ])
  if (profile.error) throw profile.error
  return Boolean(profile.data) && isStudentUser(user) && isApproved(user)
}

/**
 * Every row of a query, page by page (PostgREST caps a response at max-rows, 1000 by
 * default). `build` returns a fresh query with a deterministic order.
 */
export async function selectAll(build) {
  const rows = []
  for (let from = 0; from < MAX_ROWS; from += ROWS_PAGE) {
    const { data, error } = await build().range(from, from + ROWS_PAGE - 1)
    if (error) throw error
    rows.push(...(data || []))
    if (!data || data.length < ROWS_PAGE) break
  }
  return rows
}

/** Map student id → { lesson_count, last_lesson_date } over every lesson. */
export async function lessonStatsByStudent(admin) {
  const lessons = await selectAll(() => admin.from('lessons').select('id, student_id, lesson_date').order('id'))
  const stats = new Map()
  for (const l of lessons) {
    const s = stats.get(l.student_id) || { lesson_count: 0, last_lesson_date: null }
    s.lesson_count += 1
    if (!s.last_lesson_date || l.lesson_date > s.last_lesson_date) s.last_lesson_date = l.lesson_date
    stats.set(l.student_id, s)
  }
  return stats
}

/** Name shown for a profile: full name, else email. */
export const displayName = (profile) => profile?.full_name || profile?.email || ''
