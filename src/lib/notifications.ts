import type { SupabaseClient } from '@supabase/supabase-js';
import type { NotificationType } from '@/types/database';

/**
 * Send a notification to a specific user.
 */
export async function sendNotification(
  supabase: SupabaseClient,
  userId: string,
  type: NotificationType,
  title: string,
  body?: string,
  link?: string
) {
  return supabase.from('notifications').insert({
    user_id: userId,
    type,
    title,
    body,
    link,
  });
}

/**
 * Send a notification to all users with specific roles.
 */
export async function sendBroadcastNotification(
  supabase: SupabaseClient,
  type: NotificationType,
  title: string,
  body?: string,
  link?: string,
  roles: string[] = ['admin', 'member']
) {
  const { data: users } = await supabase
    .from('users')
    .select('id')
    .in('role', roles);

  if (!users || users.length === 0) return;

  const records = users.map((u) => ({
    user_id: u.id,
    type,
    title,
    body,
    link,
  }));

  return supabase.from('notifications').insert(records);
}
