import { SupabaseClient } from '@supabase/supabase-js';

/**
 * Captures the current handicap index for all active members for a given event.
 * This locks in their handicap at the start of the event window.
 */
export async function captureHandicapsForEvent(
  supabase: SupabaseClient,
  eventId: string,
  seasonId: string
): Promise<{ captured: number; errors: string[] }> {
  const errors: string[] = [];
  let captured = 0;

  // Get all active members
  const { data: members, error: memberError } = await supabase
    .from('users')
    .select('id, handicap_index')
    .in('role', ['admin', 'member', 'playing_guest'])
    .not('handicap_index', 'is', null);

  if (memberError) {
    return { captured: 0, errors: [`Failed to fetch members: ${memberError.message}`] };
  }

  if (!members || members.length === 0) {
    return { captured: 0, errors: ['No members with handicap index found'] };
  }

  // For each member, insert a handicap history record tied to this event
  for (const member of members) {
    const { error } = await supabase.from('handicap_history').insert({
      user_id: member.id,
      handicap_index: member.handicap_index,
      effective_date: new Date().toISOString().split('T')[0],
      source: 'event_capture',
      event_id: eventId,
    });

    if (error) {
      // May fail if event_id column doesn't exist; fall back to standard insert
      const { error: fallbackError } = await supabase.from('handicap_history').insert({
        user_id: member.id,
        handicap_index: member.handicap_index,
        effective_date: new Date().toISOString().split('T')[0],
        source: 'event_capture',
      });
      if (fallbackError) {
        errors.push(`Failed for ${member.id}: ${fallbackError.message}`);
      } else {
        captured++;
      }
    } else {
      captured++;
    }
  }

  return { captured, errors };
}
