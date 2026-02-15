import { createClient } from '@/lib/supabase/client';
import type { AuditActionType } from '@/types/database';

/**
 * Log an audit event (client-side)
 */
export async function logAuditEvent(
  actionType: AuditActionType,
  entityType?: string,
  entityId?: string,
  details?: Record<string, unknown>
) {
  try {
    const supabase = createClient();
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
