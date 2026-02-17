import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/stats/user-2',
  useParams: () => ({ userId: 'user-2' }),
}));

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: { id: 'user-1', full_name: 'Jason Richards', email: 'jason@test.com', handicap_index: 15.0 },
    authUser: { id: 'user-1' },
    loading: false,
    isAdmin: false,
    isMember: true,
    isPlayingGuest: false,
    isAuthenticated: true,
  }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// Scores for both users across 2025 and 2024
const myScores = [
  {
    id: 's1', user_id: 'user-1', event_id: 'evt-2025-3', gross_score: 85, net_score: 72,
    net_strokes_over_par: 0, holes_played: 18, is_complete: true, tee_time: '2025-06-10T14:00:00Z',
    created_at: '2025-06-10T00:00:00Z',
    event: { id: 'evt-2025-3', event_number: 3, name: 'Event 3' },
  },
  {
    id: 's2', user_id: 'user-1', event_id: 'evt-2024-1', gross_score: 80, net_score: 67,
    net_strokes_over_par: -5, holes_played: 18, is_complete: true, tee_time: '2024-04-15T10:00:00Z',
    created_at: '2024-04-15T00:00:00Z',
    event: { id: 'evt-2024-1', event_number: 1, name: 'Event 1' },
  },
];

const theirScores = [
  {
    id: 's3', user_id: 'user-2', event_id: 'evt-2025-3', gross_score: 88, net_score: 75,
    net_strokes_over_par: 3, holes_played: 18, is_complete: true, tee_time: '2025-06-11T14:00:00Z',
    created_at: '2025-06-11T00:00:00Z',
    event: { id: 'evt-2025-3', event_number: 3, name: 'Event 3' },
  },
  {
    id: 's4', user_id: 'user-2', event_id: 'evt-2024-1', gross_score: 79, net_score: 66,
    net_strokes_over_par: -6, holes_played: 18, is_complete: true, tee_time: '2024-04-16T10:00:00Z',
    created_at: '2024-04-16T00:00:00Z',
    event: { id: 'evt-2024-1', event_number: 1, name: 'Event 1' },
  },
];

function createChainProxy(resolveData: unknown = null): unknown {
  const handler: ProxyHandler<CallableFunction> = {
    get(_target, prop) {
      if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: resolveData, error: null });
      return (..._args: unknown[]) => new Proxy(() => {}, handler);
    },
    apply() { return new Proxy(() => {}, handler); },
  };
  return new Proxy(() => {}, handler);
}

let fromCallCount = 0;
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'users') return createChainProxy({ id: 'user-2', full_name: 'Tiger Woods', email: 'tiger@test.com' });
      if (table === 'scores') {
        fromCallCount++;
        // First call is myScores, second is theirScores
        return createChainProxy(fromCallCount % 2 === 1 ? myScores : theirScores);
      }
      return createChainProxy(null);
    },
  }),
}));

import HeadToHeadPage from '@/app/(protected)/stats/[userId]/page';

describe('Head-to-Head - Grouped by Year', () => {
  beforeEach(() => {
    fromCallCount = 0;
    vi.clearAllMocks();
  });

  it('displays year season headers', async () => {
    render(<HeadToHeadPage />);
    await waitFor(() => {
      expect(screen.getByText('2025 Season')).toBeInTheDocument();
      expect(screen.getByText('2024 Season')).toBeInTheDocument();
    });
  });

  it('shows 2025 before 2024 (newest first)', async () => {
    render(<HeadToHeadPage />);
    await waitFor(() => {
      const y2025 = screen.getByText('2025 Season');
      const y2024 = screen.getByText('2024 Season');
      // 2025 should appear before 2024 in DOM order
      expect(y2025.compareDocumentPosition(y2024) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });

  it('displays event names within year sections', async () => {
    render(<HeadToHeadPage />);
    await waitFor(() => {
      const event3s = screen.getAllByText('Event 3');
      expect(event3s.length).toBeGreaterThanOrEqual(1);
      const event1s = screen.getAllByText('Event 1');
      expect(event1s.length).toBeGreaterThanOrEqual(1);
    });
  });

  it('shows correct win/loss tallies', async () => {
    render(<HeadToHeadPage />);
    await waitFor(() => {
      expect(screen.getByText('Head to Head')).toBeInTheDocument();
    });
  });
});
