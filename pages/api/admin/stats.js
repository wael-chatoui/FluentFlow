// GET /api/admin/stats → { totals, last30, successRate, ai, recent } (back-office dashboard)
import { allowMethods, getRole, isAdmin, requireAdmin } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { handleError } from '@/utils/api/errors'
import { countRows, selectAll } from '@/utils/api/admin/query'
import { byNewest, listAllAuthUsers } from '@/utils/api/admin/users'
import { aiSummary, dailyCounts, lastDays, successRate } from '@/utils/api/admin/stats'

const RECENT = 5

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return
  if (!(await requireAdmin(req, res))) return

  try {
    const admin = createAdminClient()
    const days = lastDays()
    const since = `${days[0]}T00:00:00.000Z`

    const [
      users,
      onboarded,
      lessons,
      published,
      failed,
      sessionsCount,
      reviewsCount,
      recentLessons,
      allSessions,
      usages,
    ] = await Promise.all([
      listAllAuthUsers(admin),
      countRows(admin, 'profiles', (q) => q.not('onboarded_at', 'is', null)),
      countRows(admin, 'lessons'),
      countRows(admin, 'lessons', (q) => q.eq('status', 'published')),
      countRows(admin, 'lessons', (q) => q.eq('status', 'failed')),
      countRows(admin, 'practice_sessions'),
      countRows(admin, 'review_attempts'),
      admin
        .from('lessons')
        .select('id, title, student_id, status, created_at')
        .order('created_at', { ascending: false })
        .limit(RECENT),
      selectAll(() => admin.from('practice_sessions').select('score, total, completed_at').order('id')),
      selectAll(() => admin.from('lessons').select('ai_usage').not('ai_usage', 'is', null).order('id')),
    ])
    if (recentLessons.error) throw recentLessons.error
    const lessonDates = await selectAll(() =>
      admin.from('lessons').select('created_at').gte('created_at', since).order('id')
    )

    const newestUsers = [...users].sort(byNewest).slice(0, RECENT)
    const recentRows = recentLessons.data || []
    const profileIds = [...new Set([...recentRows.map((l) => l.student_id), ...newestUsers.map((u) => u.id)].filter(Boolean))]
    const profiles = new Map()
    if (profileIds.length) {
      const { data, error } = await admin.from('profiles').select('id, full_name, email').in('id', profileIds)
      if (error) throw error
      for (const p of data || []) profiles.set(p.id, p)
    }

    return res.status(200).json({
      totals: {
        users: users.length,
        students: users.filter((u) => getRole(u) === 'student').length,
        teachers: users.filter((u) => getRole(u) === 'teacher').length,
        admins: users.filter((u) => isAdmin(u)).length,
        onboarded,
        lessons,
        lessons_published: published,
        lessons_failed: failed,
        practice_sessions: sessionsCount,
        review_attempts: reviewsCount,
      },
      last30: {
        days,
        signups: dailyCounts(days, users.map((u) => u.created_at)),
        lessons: dailyCounts(days, lessonDates.map((l) => l.created_at)),
        sessions: dailyCounts(days, allSessions.map((s) => s.completed_at)),
      },
      successRate: successRate(allSessions),
      ai: aiSummary(usages.map((l) => l.ai_usage)),
      recent: {
        lessons: recentRows.map((l) => ({
          id: l.id,
          title: l.title,
          student_id: l.student_id,
          student_name: profiles.get(l.student_id)?.full_name || profiles.get(l.student_id)?.email || '',
          status: l.status,
          created_at: l.created_at,
        })),
        signups: newestUsers.map((u) => ({
          id: u.id,
          email: u.email || '',
          full_name: profiles.get(u.id)?.full_name || u.user_metadata?.full_name || null,
          created_at: u.created_at,
        })),
      },
    })
  } catch (err) {
    return handleError(res, err, 'admin/stats', 'fr')
  }
}
