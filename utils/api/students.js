// Student lookups for teacher routes. A "student" is a profile whose auth user
// does not have the teacher role (roles live in app_metadata).
import { getRole } from '@/utils/auth/server'

const PAGE_SIZE = 1000
const MAX_PAGES = 20

/** Ids of every teacher account. */
export async function listTeacherIds(admin) {
  const ids = new Set()
  for (let page = 1; page <= MAX_PAGES; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PAGE_SIZE })
    if (error) throw error
    const users = data?.users || []
    users.filter((u) => getRole(u) === 'teacher').forEach((u) => ids.add(u.id))
    if (users.length < PAGE_SIZE) break
  }
  return ids
}

/** True if `id` is an existing auth user without the teacher role. */
export async function isStudentAccount(admin, id) {
  const { data, error } = await admin.auth.admin.getUserById(id)
  if (error && error.status !== 404) throw error
  if (!data?.user) return false
  return getRole(data.user) !== 'teacher'
}
