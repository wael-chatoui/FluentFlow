// Back-office audit trail: every admin write calls logAdminAction after it succeeds.
// Logging failures are reported server-side but never fail the admin's request.

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} admin  service-role client
 * @param {import('@supabase/supabase-js').User} actor            the admin performing the action
 * @param {{ action: string, entity: string, entityId?: string|null, details?: object|null }} entry
 *   action like 'user.update', 'lesson.delete'; details = what changed (never secrets)
 */
export async function logAdminAction(admin, actor, { action, entity, entityId = null, details = null }) {
  try {
    const { error } = await admin.from('admin_audit_log').insert({
      admin_id: actor?.id || null,
      admin_email: actor?.email || null,
      action,
      entity,
      entity_id: entityId,
      details,
    })
    if (error) throw error
  } catch (err) {
    console.error('[audit] could not record', action, entityId, err)
  }
}
