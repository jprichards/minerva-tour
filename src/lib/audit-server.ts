import { createClient } from '@/lib/supabase/server';
import type { AuditActionType } from '@/types/database';

/**
 * Log an audit event (server-side)
 */
export async function logAuditEventServer(
  actionType: AuditActionType,
  entityType?: string,
  entityId?: string,
  details?: Record<string, unknown>
) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    await supabase.from('audit_logs').insert({
      user_id: user?.id,
      action_type: actionType,
      entity_type: entityType,
      entity_id: entityId,
      details,
    });
  } catch (error) {
    console.error('Failed to log audit event:', error);
  }
}
