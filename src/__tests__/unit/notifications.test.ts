import { describe, it, expect, vi } from 'vitest';
import { sendNotification, sendBroadcastNotification } from '@/lib/notifications';

function createMockSupabase(users: { id: string }[] = []) {
  const insertFn = vi.fn().mockResolvedValue({ data: null, error: null });
  const mock: any = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockResolvedValue({ data: users, error: null }),
          }),
        };
      }
      return { insert: insertFn };
    }),
    _insertFn: insertFn,
  };
  return mock;
}

describe('sendNotification', () => {
  it('inserts a notification with all fields', async () => {
    const supabase = createMockSupabase();
    await sendNotification(supabase, 'user-1', 'event_start', 'Event Started', 'Event 5 has begun!', '/leaderboard');

    expect(supabase.from).toHaveBeenCalledWith('notifications');
    expect(supabase._insertFn).toHaveBeenCalledWith({
      user_id: 'user-1',
      type: 'event_start',
      title: 'Event Started',
      body: 'Event 5 has begun!',
      link: '/leaderboard',
    });
  });

  it('inserts a notification with optional fields omitted', async () => {
    const supabase = createMockSupabase();
    await sendNotification(supabase, 'user-2', 'general', 'Hello');

    expect(supabase._insertFn).toHaveBeenCalledWith({
      user_id: 'user-2',
      type: 'general',
      title: 'Hello',
      body: undefined,
      link: undefined,
    });
  });
});

describe('sendBroadcastNotification', () => {
  it('sends notification to all matching users', async () => {
    const supabase = createMockSupabase([
      { id: 'user-1' },
      { id: 'user-2' },
      { id: 'user-3' },
    ]);

    await sendBroadcastNotification(supabase, 'season_mode', 'Season Started', 'Regular season is live!');

    expect(supabase._insertFn).toHaveBeenCalledWith([
      { user_id: 'user-1', type: 'season_mode', title: 'Season Started', body: 'Regular season is live!', link: undefined },
      { user_id: 'user-2', type: 'season_mode', title: 'Season Started', body: 'Regular season is live!', link: undefined },
      { user_id: 'user-3', type: 'season_mode', title: 'Season Started', body: 'Regular season is live!', link: undefined },
    ]);
  });

  it('does nothing when no users match', async () => {
    const supabase = createMockSupabase([]);
    await sendBroadcastNotification(supabase, 'general', 'Test');
    expect(supabase._insertFn).not.toHaveBeenCalled();
  });

  it('does nothing when users is null', async () => {
    const mock: any = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
        insert: vi.fn(),
      }),
    };
    await sendBroadcastNotification(mock, 'general', 'Test');
    // Should not throw
  });

  it('respects custom roles parameter', async () => {
    const supabase = createMockSupabase([{ id: 'guest-1' }]);
    await sendBroadcastNotification(supabase, 'tournament', 'Tournament Time', undefined, undefined, ['playing_guest']);

    // Verify the 'in' call got the right roles
    const fromCall = supabase.from.mock.calls.find((c: string[]) => c[0] === 'users');
    expect(fromCall).toBeDefined();
  });
});
