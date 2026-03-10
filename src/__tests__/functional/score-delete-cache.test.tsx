import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockRouter = { push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
const mockMutate = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/scores/score-1',
  useParams: () => ({ id: 'score-1' }),
}));

vi.mock('swr', () => ({
  useSWRConfig: () => ({ mutate: mockMutate }),
  default: vi.fn(() => ({ data: null, isLoading: false })),
}));

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: { id: 'user-1', full_name: 'Test User', email: 'test@test.com', handicap_index: 10 },
    authUser: { id: 'user-1' },
    loading: false,
    isAdmin: false,
    isMember: true,
    isPlayingGuest: false,
    isAuthenticated: true,
  }),
}));

vi.mock('@/lib/hooks/useSeason', () => ({
  useSeason: () => ({
    season: null,
    currentEvent: { id: 'evt-1', name: 'Event 1', start_date: '2026-01-01', end_date: '2026-12-31', event_number: 1 },
    loading: false,
    isOffSeason: false,
    isRegularSeason: true,
    isPlayoffs: false,
    isTournament: false,
    canSubmitScores: true,
  }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock('@/lib/slack-notify', () => ({
  notifySlack: vi.fn(),
}));

const scoreData = {
  id: 'score-1',
  user_id: 'user-1',
  event_id: 'evt-1',
  course_id: 'course-1',
  gross_score: 85,
  net_score: 72,
  net_strokes_over_par: 0,
  holes_played: 18,
  is_complete: true,
  course_handicap: 13,
  points_awarded: null,
  tee_time: '2026-03-01T14:00:00Z',
  submitted_by: 'user-1',
  created_at: '2026-03-01T00:00:00Z',
  course: { id: 'course-1', course_name: 'Pine Valley', tee_name: 'Blue', type: '18_holes', par: 72, rating: 72.5, slope: 130 },
  user: { full_name: 'Test User', email: 'test@test.com', handicap_index: 10, profile_picture_url: null },
  event: { id: 'evt-1', name: 'Event 1', start_date: '2026-01-01', end_date: '2026-12-31', event_number: 1, is_major: false, season_id: 's-1' },
};

let deleteResolvedData: unknown[] | null = [scoreData];

function createChainProxy(resolveData: unknown = null): unknown {
  const handler: ProxyHandler<CallableFunction> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve({ data: resolveData, error: null });
      }
      return (..._args: unknown[]) => new Proxy(() => {}, handler);
    },
    apply() {
      return new Proxy(() => {}, handler);
    },
  };
  return new Proxy(() => {}, handler);
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'scores') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: scoreData, error: null }),
            }),
          }),
          update: () => createChainProxy(null),
          delete: () => ({
            eq: () => ({
              select: () => Promise.resolve({ data: deleteResolvedData, error: null }),
            }),
          }),
        };
      }
      if (table === 'seasons') {
        return createChainProxy([{ id: 's-1' }]);
      }
      if (table === 'events') {
        return {
          select: () => ({
            eq: () => ({
              lte: () => ({
                gte: () => ({
                  limit: () => Promise.resolve({ data: [{ id: 'evt-1', name: 'Event 1', start_date: '2026-01-01', end_date: '2026-12-31' }], error: null }),
                }),
              }),
            }),
          }),
        };
      }
      return createChainProxy(null);
    },
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }),
    removeChannel: vi.fn(),
  }),
}));

import { logAuditEvent } from '@/lib/audit';
import ScoreDetailPage from '@/app/(protected)/scores/[id]/page';

describe('Score Delete - SWR Cache Invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    deleteResolvedData = [scoreData];
    vi.spyOn(window, 'confirm').mockReturnValue(true);
  });

  it('invalidates leaderboard SWR cache after successful delete', async () => {
    render(<ScoreDetailPage />);

    const deleteButton = await screen.findByText('Delete Score', {}, { timeout: 3000 });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith('leaderboard');
    });
  });

  it('invalidates scores SWR cache after successful delete', async () => {
    render(<ScoreDetailPage />);

    const deleteButton = await screen.findByText('Delete Score', {}, { timeout: 3000 });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockMutate).toHaveBeenCalledWith(
        expect.any(Function),
        undefined,
        { revalidate: true }
      );
    });
  });

  it('redirects to /scores after successful delete', async () => {
    render(<ScoreDetailPage />);

    const deleteButton = await screen.findByText('Delete Score', {}, { timeout: 3000 });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockRouter.push).toHaveBeenCalledWith('/scores?tab=completed');
    });
  });

  it('logs enriched audit event with full score metadata on delete', async () => {
    render(<ScoreDetailPage />);

    const deleteButton = await screen.findByText('Delete Score', {}, { timeout: 3000 });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(logAuditEvent).toHaveBeenCalledWith('score_delete', 'score', 'score-1', {
        player: 'Test User',
        course: 'Pine Valley',
        tee: 'Blue',
        gross_score: 85,
        holes_played: 18,
        net_strokes_over_par: 0,
        course_handicap: 13,
        net_score: 72,
        tee_time: '2026-03-01T14:00:00Z',
        is_complete: true,
        event_name: 'Event 1',
      });
    });
  });

  it('does NOT invalidate cache or redirect when delete returns 0 rows', async () => {
    deleteResolvedData = [];
    render(<ScoreDetailPage />);

    const deleteButton = await screen.findByText('Delete Score', {}, { timeout: 3000 });
    fireEvent.click(deleteButton);

    await waitFor(() => {
      expect(mockMutate).not.toHaveBeenCalledWith('leaderboard');
      expect(mockRouter.push).not.toHaveBeenCalled();
    });
  });
});
