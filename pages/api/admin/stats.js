// GET /api/admin/stats → { totals, last30, successRate, ai, recent } (back-office dashboard)
// AI spend comes from the ai_generations ledger (every attempt, failures and tutor plans
// included); when that table is unavailable it falls back to lessons.ai_usage (a lower bound).
// ai.cost_usd = the cost reported by OpenRouter (cost_usd) where known, the token × price
// estimate for the other calls; ai.cost_source says which: 'provider' | 'mixed' | 'estimate'.
import { allowMethods, getRole, isAdmin, isApproved, requireAdmin } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { handleError } from '@/utils/api/errors'
import { isMissingColumn } from '@/utils/ai/ledger'
import { countRows, selectAll, unavailableTable } from '@/utils/api/admin/query'
import { accessState, byNewest, listAllAuthUsers, nameOf } from '@/utils/api/admin/users'
import { aiLedgerSummary, aiUsageSummary, dailyCounts, financeSummary, lastDays, successRate } from '@/utils/api/admin/stats'

const RECENT = 5
const LEDGER_FIELDS = 'kind, ok, prompt_tokens, completion_tokens, duration_ms, created_at'

// Ledger rows, with cost_usd when the column exists (added to 0006 later: a database
// that ran the first version of 0006 does not have it until the migration is re-run)
async function loadLedger(admin) {
  const rows = (fields) => selectAll(() => admin.from('ai_generations').select(fields).order('id'))
  try {
    return await rows(`${LEDGER_FIELDS}, cost_usd`)
  } catch (err) {
    if (!isMissingColumn(err)) throw err
    return rows(LEDGER_FIELDS)
  }
}

async function loadAi(admin, since) {
  try {
    const rows = await loadLedger(admin)
    return { summary: aiLedgerSummary(rows, process.env, { since }), dates: rows.map((r) => r.created_at) }
  } catch (err) {
    const reason = unavailableTable(err)
    if (!reason) throw err
    if (reason === 'forbidden') console.error('[admin] ai_generations not granted to service_role:', err)
    const lessons = await selectAll(() => admin.from('lessons').select('ai_usage').not('ai_usage', 'is', null).order('id'))
    return { summary: aiUsageSummary(lessons.map((l) => l.ai_usage)), dates: null }
  }
}

async function loadSubscriptions(admin) {
  try {
    return await selectAll(() =>
      admin
        .from('subscriptions')
        .select('id, user_id, provider, status, amount_cents, currency, plan, created_at')
        .order('id')
    )
  } catch (err) {
    const reason = unavailableTable(err)
    if (!reason) throw err
    return []
  }
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return
  if (!(await requireAdmin(req, res))) return

  try {
    const admin = createAdminClient()
    const days = lastDays()
    const since = `${days[0]}T00:00:00.000Z`

    const [
      users,
      onboardedProfiles,
      lessons,
      published,
      failed,
      hidden,
      sessionsCount,
      reviewsCount,
      recentLessons,
      allSessions,
      lessonDates,
      ai,
      subscriptions,
    ] = await Promise.all([
      listAllAuthUsers(admin),
      selectAll(() => admin.from('profiles').select('id').not('onboarded_at', 'is', null).order('id')),
      countRows(admin, 'lessons'),
      countRows(admin, 'lessons', (q) => q.eq('status', 'published')),
      countRows(admin, 'lessons', (q) => q.eq('status', 'failed')),
      countRows(admin, 'lessons', (q) => q.eq('hidden', true)),
      countRows(admin, 'practice_sessions'),
      countRows(admin, 'review_attempts'),
      admin
        .from('lessons')
        .select('id, title, student_id, status, hidden, created_at')
        .order('created_at', { ascending: false })
        .limit(RECENT),
      selectAll(() => admin.from('practice_sessions').select('score, total, completed_at').order('id')),
      selectAll(() => admin.from('lessons').select('created_at').gte('created_at', since).order('id')),
      loadAi(admin, since),
      loadSubscriptions(admin),
    ])
    if (recentLessons.error) throw recentLessons.error

    // Teachers are onboarded by migration 0002: only students count here
    const students = users.filter((u) => getRole(u) === 'student')
    const studentIds = new Set(students.map((u) => u.id))
    const onboarded = onboardedProfiles.filter((p) => studentIds.has(p.id)).length

    const finance = financeSummary(subscriptions, ai.summary.cost_usd, students.length)

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
        students: students.length,
        teachers: users.filter((u) => getRole(u) === 'teacher').length,
        admins: users.filter((u) => isAdmin(u)).length,
        pending_approval: users.filter((u) => !isApproved(u)).length,
        invites_pending: users.filter((u) => accessState(u).invite_pending).length,
        onboarded,
        lessons,
        lessons_published: published,
        lessons_failed: failed,
        lessons_hidden: hidden,
        practice_sessions: sessionsCount,
        review_attempts: reviewsCount,
      },
      finance,
      last30: {
        days,
        signups: dailyCounts(days, users.map((u) => u.created_at)),
        lessons: dailyCounts(days, lessonDates.map((l) => l.created_at)),
        sessions: dailyCounts(days, allSessions.map((s) => s.completed_at)),
        ...(ai.dates ? { generations: dailyCounts(days, ai.dates) } : {}),
      },
      successRate: successRate(allSessions),
      ai: ai.summary,
      recent: {
        lessons: recentRows.map((l) => ({
          id: l.id,
          title: l.title,
          student_id: l.student_id,
          student_name: profiles.get(l.student_id)?.full_name || profiles.get(l.student_id)?.email || '',
          status: l.status,
          hidden: Boolean(l.hidden),
          created_at: l.created_at,
        })),
        signups: newestUsers.map((u) => ({
          id: u.id,
          email: u.email || '',
          full_name: nameOf(u, profiles.get(u.id)),
          approved: isApproved(u),
          created_at: u.created_at,
        })),
      },
    })
  } catch (err) {
    return handleError(res, err, 'admin/stats', 'fr')
  }
}
