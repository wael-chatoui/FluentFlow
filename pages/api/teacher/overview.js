// GET /api/teacher/overview → teacher dashboard data:
// {
//   attention: { failed: [L], stale: [L], drafts: [L], regenFailed: [L] },
//   inactive: [{ id, full_name, email, last_lesson_date, days }],
//   activity: [{ student_id, student_name, lesson_id, lesson_title, score, total, completed_at }],
//   pending: [{ id, email, full_name, created_at, provider }],
// }
// L = { id, title, lesson_date, student_id, student_name, error, updated_at }
// failed = first generation failed; stale = 'generating' for more than 5 min;
// drafts = generated but hidden from the student; regenFailed = a regeneration failed
// (the previous version is still published). inactive = approved students whose last
// lesson is more than 14 days old (or who have none and joined more than 7 days ago).
// activity = practice sessions of the last 7 days (20 newest).
import { allowMethods, isBanned, requireTeacher } from '@/utils/auth/server'
import { createAdminClient } from '@/utils/supabase/admin'
import { handleError } from '@/utils/api/errors'
import { STALE_GENERATION_MS } from '@/utils/lesson/schema'
import {
  authUsersById,
  displayName,
  isPendingUser,
  isStudentUser,
  lessonStatsByStudent,
  providerOf,
  selectAll,
} from '@/utils/api/students'

const DAY_MS = 24 * 60 * 60 * 1000
const INACTIVE_AFTER_DAYS = 14
const NEW_STUDENT_GRACE_DAYS = 7
const ACTIVITY_DAYS = 7
const ACTIVITY_LIMIT = 20
const ATTENTION_LIMIT = 20
const LESSON_FIELDS = 'id, title, lesson_date, student_id, error, updated_at'

// Whole days between a date (YYYY-MM-DD or ISO timestamp) and now; 0 when unknown
function daysSince(value, now) {
  const at = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value || '') ? `${value}T00:00:00Z` : value || '')
  return Number.isFinite(at) ? Math.max(0, Math.floor((now - at) / DAY_MS)) : 0
}

function attentionQueries(admin, now) {
  const lessons = () => admin.from('lessons').select(LESSON_FIELDS).limit(ATTENTION_LIMIT)
  const staleBefore = new Date(now - STALE_GENERATION_MS).toISOString()
  return {
    failed: lessons().eq('status', 'failed').order('updated_at', { ascending: false }),
    stale: lessons().eq('status', 'generating').lt('updated_at', staleBefore).order('updated_at', { ascending: true }),
    drafts: lessons().eq('hidden', true).eq('status', 'published').not('content', 'is', null).order('lesson_date', { ascending: false }),
    regenFailed: lessons().eq('status', 'published').not('error', 'is', null).order('updated_at', { ascending: false }),
  }
}

async function loadAttention(admin, now) {
  const queries = attentionQueries(admin, now)
  const keys = Object.keys(queries)
  const results = await Promise.all(keys.map((k) => queries[k]))
  for (const r of results) if (r.error) throw r.error
  return Object.fromEntries(keys.map((k, i) => [k, results[i].data || []]))
}

async function loadActivity(admin, now) {
  const since = new Date(now - ACTIVITY_DAYS * DAY_MS).toISOString()
  const { data, error } = await admin
    .from('practice_sessions')
    .select('student_id, lesson_id, score, total, completed_at')
    .gte('completed_at', since)
    .order('completed_at', { ascending: false })
    .limit(ACTIVITY_LIMIT)
  if (error) throw error
  const sessions = data || []
  const lessonIds = [...new Set(sessions.map((s) => s.lesson_id))]
  if (!lessonIds.length) return { sessions, titles: new Map() }
  const { data: lessons, error: lessonsError } = await admin.from('lessons').select('id, title').in('id', lessonIds)
  if (lessonsError) throw lessonsError
  return { sessions, titles: new Map((lessons || []).map((l) => [l.id, l.title])) }
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ['GET'])) return
  if (!(await requireTeacher(req, res))) return

  try {
    const admin = createAdminClient()
    const now = Date.now()
    const [attention, activity, users, profiles, stats] = await Promise.all([
      loadAttention(admin, now),
      loadActivity(admin, now),
      authUsersById(admin),
      selectAll(() => admin.from('profiles').select('id, full_name, email, created_at').order('id')),
      lessonStatsByStudent(admin),
    ])
    const profileById = new Map(profiles.map((p) => [p.id, p]))
    const nameOf = (id) => displayName(profileById.get(id))

    const toItem = (l) => ({
      id: l.id,
      title: l.title,
      lesson_date: l.lesson_date,
      student_id: l.student_id,
      student_name: nameOf(l.student_id),
      error: l.error,
      updated_at: l.updated_at,
    })

    const inactive = []
    const pending = []
    for (const user of users.values()) {
      if (!isStudentUser(user) || isBanned(user)) continue
      const profile = profileById.get(user.id)
      if (isPendingUser(user)) {
        pending.push({
          id: user.id,
          email: user.email || profile?.email || '',
          full_name: profile?.full_name || user.user_metadata?.full_name || user.user_metadata?.name || null,
          created_at: user.created_at || profile?.created_at || null,
          provider: providerOf(user),
        })
        continue
      }
      if (!profile) continue
      const last = stats.get(user.id)?.last_lesson_date || null
      const days = daysSince(last || profile.created_at || user.created_at, now)
      if (last ? days > INACTIVE_AFTER_DAYS : days > NEW_STUDENT_GRACE_DAYS) {
        inactive.push({ id: user.id, full_name: profile.full_name, email: profile.email || user.email || '', last_lesson_date: last, days })
      }
    }
    inactive.sort((a, b) => b.days - a.days)
    pending.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))

    return res.status(200).json({
      attention: {
        failed: attention.failed.map(toItem),
        stale: attention.stale.map(toItem),
        drafts: attention.drafts.map(toItem),
        regenFailed: attention.regenFailed.map(toItem),
      },
      inactive,
      activity: activity.sessions.map((s) => ({
        student_id: s.student_id,
        student_name: nameOf(s.student_id),
        lesson_id: s.lesson_id,
        lesson_title: activity.titles.get(s.lesson_id) || '',
        score: s.score,
        total: s.total,
        completed_at: s.completed_at,
      })),
      pending,
    })
  } catch (err) {
    return handleError(res, err, 'teacher/overview', 'fr')
  }
}
