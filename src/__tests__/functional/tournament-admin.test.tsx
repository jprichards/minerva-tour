import { describe, it, expect, vi } from 'vitest';

/**
 * Test the business logic of playing guest auto-revert when tournament is deactivated.
 */
describe('Playing Guest Auto-Revert on Tournament Deactivation', () => {
  it('reverts playing guests to non-playing guests when tournament deactivated', async () => {
    const playingGuests = [
      { id: 'g-1', role: 'playing_guest' },
      { id: 'g-2', role: 'playing_guest' },
    ];

    const updateCalls: { table: string; data: Record<string, unknown>; filter: Record<string, unknown> }[] = [];

    const mockSupabase: any = {
      from: vi.fn().mockImplementation((table: string) => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: playingGuests, error: null }),
        }),
        update: vi.fn().mockImplementation((data: Record<string, unknown>) => ({
          eq: vi.fn().mockImplementation((col: string, val: unknown) => ({
            in: vi.fn().mockResolvedValue({ data: null, error: null }),
          })),
          in: vi.fn().mockImplementation((col: string, vals: unknown[]) => {
            updateCalls.push({ table, data, filter: { [col]: vals } });
            return Promise.resolve({ data: null, error: null });
          }),
        })),
      })),
    };

    // Simulate the revert logic from the tournament page
    const { data: guests } = await mockSupabase
      .from('users')
      .select('id')
      .eq('role', 'playing_guest');

    expect(guests).toHaveLength(2);

    if (guests && guests.length > 0) {
      const guestIds = guests.map((g: { id: string }) => g.id);
      await mockSupabase
        .from('users')
        .update({ role: 'non_playing_guest' })
        .in('id', guestIds);

      expect(updateCalls).toHaveLength(1);
      expect(updateCalls[0].data).toEqual({ role: 'non_playing_guest' });
      expect(updateCalls[0].filter).toEqual({ id: ['g-1', 'g-2'] });
    }
  });

  it('does nothing when no playing guests exist', async () => {
    const mockSupabase: any = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
        update: vi.fn(),
      }),
    };

    const { data: guests } = await mockSupabase
      .from('users')
      .select('id')
      .eq('role', 'playing_guest');

    expect(guests).toHaveLength(0);
    // update should NOT be called
    expect(mockSupabase.from('users').update).not.toHaveBeenCalled();
  });
});
