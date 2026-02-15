import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { SWRConfig } from 'swr';
import React from 'react';
import { mockSupabaseClient } from '../setup';

// SWR cache isolation wrapper for tests
const swrWrapper = ({ children }: { children: React.ReactNode }) => (
  <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
    {children}
  </SWRConfig>
);

describe('useUser hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns unauthenticated state when no user', async () => {
    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const { useUser } = await import('@/lib/hooks/useUser');
    const { result } = renderHook(() => useUser(), { wrapper: swrWrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.authUser).toBeNull();
    expect(result.current.profile).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.isAdmin).toBe(false);
    expect(result.current.isMember).toBe(false);
    expect(result.current.isPlayingGuest).toBe(false);
  });

  it('returns authenticated state with profile', async () => {
    const mockAuthUser = { id: 'user-123', email: 'test@example.com' };
    const mockProfile = {
      id: 'user-123',
      full_name: 'Test User',
      email: 'test@example.com',
      role: 'admin',
      handicap_index: 12.5,
    };

    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: mockAuthUser },
      error: null,
    });

    const singleMock = vi.fn().mockResolvedValue({ data: mockProfile, error: null });
    const eqMock = vi.fn().mockReturnValue({ single: singleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    mockSupabaseClient.from.mockReturnValue({ select: selectMock });

    const { useUser } = await import('@/lib/hooks/useUser');
    const { result } = renderHook(() => useUser(), { wrapper: swrWrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.authUser).toEqual(mockAuthUser);
    expect(result.current.profile).toEqual(mockProfile);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.isMember).toBe(true);
  });

  it('identifies playing guest role', async () => {
    const mockAuthUser = { id: 'guest-1', email: 'guest@example.com' };
    const mockProfile = {
      id: 'guest-1',
      full_name: 'Guest Player',
      email: 'guest@example.com',
      role: 'playing_guest',
      handicap_index: null,
    };

    mockSupabaseClient.auth.getUser.mockResolvedValue({
      data: { user: mockAuthUser },
      error: null,
    });

    const singleMock = vi.fn().mockResolvedValue({ data: mockProfile, error: null });
    const eqMock = vi.fn().mockReturnValue({ single: singleMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    mockSupabaseClient.from.mockReturnValue({ select: selectMock });

    const { useUser } = await import('@/lib/hooks/useUser');
    const { result } = renderHook(() => useUser(), { wrapper: swrWrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isPlayingGuest).toBe(true);
    expect(result.current.isMember).toBe(false);
    expect(result.current.isAdmin).toBe(false);
  });
});

describe('useSeason hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('fetches current season and event', async () => {
    const mockSeason = {
      id: 's-1',
      year: 2024,
      mode: 'off_season',
      current_event_id: null,
    };

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'seasons') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [mockSeason], error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            lte: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      };
    });

    const { useSeason } = await import('@/lib/hooks/useSeason');
    const { result } = renderHook(() => useSeason(), { wrapper: swrWrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.season).toEqual(mockSeason);
    expect(result.current.isOffSeason).toBe(true);
    expect(result.current.isRegularSeason).toBe(false);
    expect(result.current.canSubmitScores).toBe(false);
  });

  it('returns regular season mode correctly', async () => {
    const mockSeason = {
      id: 's-1',
      year: 2024,
      mode: 'regular_season',
      current_event_id: null,
    };

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'seasons') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [mockSeason], error: null }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            lte: vi.fn().mockReturnValue({
              gte: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      };
    });

    const { useSeason } = await import('@/lib/hooks/useSeason');
    const { result } = renderHook(() => useSeason(), { wrapper: swrWrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.isRegularSeason).toBe(true);
    expect(result.current.canSubmitScores).toBe(true);
    expect(result.current.isOffSeason).toBe(false);
  });

  it('handles no seasons gracefully', async () => {
    mockSupabaseClient.from.mockImplementation(() => ({
      select: vi.fn().mockReturnValue({
        order: vi.fn().mockReturnValue({
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }),
    }));

    const { useSeason } = await import('@/lib/hooks/useSeason');
    const { result } = renderHook(() => useSeason(), { wrapper: swrWrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.season).toBeNull();
    expect(result.current.isOffSeason).toBe(false);
    expect(result.current.canSubmitScores).toBe(true);
  });
});

describe('useNotifications hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns empty state when no userId', async () => {
    const { useNotifications } = await import('@/lib/hooks/useNotifications');
    const { result } = renderHook(() => useNotifications(undefined), { wrapper: swrWrapper });

    // With null key, SWR doesn't fetch, so notifications = default []
    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it('fetches and counts notifications correctly', async () => {
    const mockNotifications = [
      { id: 'n-1', user_id: 'user-1', type: 'event_start', title: 'Event!', is_read: false, created_at: '2024-01-01' },
      { id: 'n-2', user_id: 'user-1', type: 'general', title: 'Hello', is_read: true, created_at: '2024-01-02' },
      { id: 'n-3', user_id: 'user-1', type: 'score_posted', title: 'Score', is_read: false, created_at: '2024-01-03' },
    ];

    const limitMock = vi.fn().mockResolvedValue({ data: mockNotifications, error: null });
    const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
    const eqMock = vi.fn().mockReturnValue({ order: orderMock });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    mockSupabaseClient.from.mockReturnValue({ select: selectMock });

    const { useNotifications } = await import('@/lib/hooks/useNotifications');
    const { result } = renderHook(() => useNotifications('user-1'), { wrapper: swrWrapper });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.notifications).toHaveLength(3);
    expect(result.current.unreadCount).toBe(2);
  });
});
