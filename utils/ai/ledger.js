// AI ledger (table ai_generations, migration 0006): one row per generation attempt,
// success or failure, so the back office can show real cost, failure rate and latency.
// Writing it is best effort: it never fails the generation.
import { costOf } from '@/utils/ai/client'

/** PostgREST / Postgres error for a table that does not exist (migration not applied). */
export function isMissingTable(error) {
  return error?.code === '42P01' || error?.code === 'PGRST205' || /could not find the table|relation .* does not exist/i.test(error?.message || '')
}

/** PostgREST / Postgres error for a column that does not exist (e.g. cost_usd before 0006 was re-run). */
export function isMissingColumn(error) {
  return error?.code === 'PGRST204' || error?.code === '42703'
}

/**
 * @param {{ kind: 'lesson'|'plan', lessonId?: string|null, studentId?: string|null, model?: string|null,
 *           ok: boolean, error?: string|null,
 *           usage?: { prompt_tokens?: number, completion_tokens?: number, cost?: number } | null,
 *           durationMs: number }} entry
 *   usage.cost = USD reported by the provider (OpenRouter), stored in cost_usd
 */
export async function recordGeneration(admin, { kind, lessonId = null, studentId = null, model = null, ok, error = null, usage = null, durationMs }) {
  let row = {
    kind,
    lesson_id: lessonId,
    student_id: studentId,
    model,
    ok,
    error: error ? String(error).slice(0, 500) : null,
    prompt_tokens: usage?.prompt_tokens ?? null,
    completion_tokens: usage?.completion_tokens ?? null,
    duration_ms: Math.max(0, Math.round(durationMs)),
  }
  // Only when known: a row without it falls back to the token × price estimate
  const cost = costOf(usage?.cost)
  if (cost !== null) row.cost_usd = cost

  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { error: insertError } = await admin.from('ai_generations').insert(row)
      if (!insertError) return
      // Foreign key: the lesson (or the account) was deleted during the generation
      if (insertError.code === '23503' && (row.lesson_id || row.student_id)) {
        row = { ...row, lesson_id: null, student_id: null }
        continue
      }
      // Ledger created by an older 0006 (no cost_usd yet): keep the row without the cost
      if (isMissingColumn(insertError) && 'cost_usd' in row) {
        row = { ...row }
        delete row.cost_usd
        continue
      }
      if (!isMissingTable(insertError)) console.error('[ai] ledger insert:', insertError)
      return
    }
  } catch (err) {
    console.error('[ai] ledger insert:', err)
  }
}
