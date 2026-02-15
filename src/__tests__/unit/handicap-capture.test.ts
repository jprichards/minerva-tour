import { describe, it, expect, vi, beforeEach } from 'vitest';
import { captureHandicapsForEvent } from '@/lib/handicap-capture';

// Create a mock Supabase client for these tests
function createMockSupabase(options: {
  members?: { id: string; handicap_index: number }[];
  memberError?: { message: string } | null;
  insertError?: { message: string } | null;
  fallbackError?: { message: string } | null;
} = {}) {
  const {
    members = [],
    memberError = null,
    insertError = null,
    fallbackError = null,
  } = options;

  let insertCallCount = 0;

  const mock: any = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'users') {
        return {
          select: vi.fn().mockReturnValue({
            in: vi.fn().mockReturnValue({
              not: vi.fn().mockResolvedValue({
                data: memberError ? null : members,
                error: memberError,
              }),
            }),
          }),
        };
      }
      if (table === 'handicap_history') {
        return {
          insert: vi.fn().mockImplementation(() => {
            insertCallCount++;
            if (insertError && !fallbackError) {
              // First call errors, but no fallback error means fallback succeeds
              return Promise.resolve({ data: null, error: insertCallCount <= members.length ? insertError : null });
            }
            if (insertError) {
              return Promise.resolve({ data: null, error: insertError });
            }
            return Promise.resolve({ data: null, error: null });
          }),
        };
      }
      return { select: vi.fn().mockReturnThis(), insert: vi.fn().mockResolvedValue({ data: null, error: null }) };
    }),
  };

  return mock;
}

describe('captureHandicapsForEvent', () => {
  it('captures handicaps for all members', async () => {
    const supabase = createMockSupabase({
      members: [
        { id: 'user-1', handicap_index: 10.5 },
        { id: 'user-2', handicap_index: 15.2 },
        { id: 'user-3', handicap_index: 8.0 },
      ],
    });

    const result = await captureHandicapsForEvent(supabase, 'event-1', 'season-1');
    expect(result.captured).toBe(3);
    expect(result.errors).toHaveLength(0);
  });

  it('returns error when member fetch fails', async () => {
    const supabase = createMockSupabase({
      memberError: { message: 'Network error' },
    });

    const result = await captureHandicapsForEvent(supabase, 'event-1', 'season-1');
    expect(result.captured).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain('Failed to fetch members');
  });

  it('returns error when no members have handicap', async () => {
    const supabase = createMockSupabase({
      members: [],
    });

    const result = await captureHandicapsForEvent(supabase, 'event-1', 'season-1');
    expect(result.captured).toBe(0);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toBe('No members with handicap index found');
  });

  it('handles null members response', async () => {
    const mock: any = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockReturnValue({
            not: vi.fn().mockResolvedValue({ data: null, error: null }),
          }),
        }),
      }),
    };

    const result = await captureHandicapsForEvent(mock, 'event-1', 'season-1');
    expect(result.captured).toBe(0);
    expect(result.errors).toContain('No members with handicap index found');
  });
});
