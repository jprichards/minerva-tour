import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

// --- H2H page tests with ?vs= query param ---

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams('vs=user-a'),
  usePathname: () => '/stats/user-b',
  useParams: () => ({ userId: 'user-b' }),
}));

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: { id: 'logged-in-user', full_name: 'Jason Richards', email: 'jason@test.com', handicap_index: 15.0 },
    authUser: { id: 'logged-in-user' },
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

const playerAScores = [
  {
    id: 's1', user_id: 'user-a', event_id: 'evt-1', gross_score: 82, net_score: 70,
    net_strokes_over_par: -2, holes_played: 18, is_complete: true, tee_time: '2025-05-10T14:00:00Z',
    created_at: '2025-05-10T00:00:00Z',
    event: { id: 'evt-1', event_number: 1, name: 'Event 1' },
  },
];

const playerBScores = [
  {
    id: 's2', user_id: 'user-b', event_id: 'evt-1', gross_score: 90, net_score: 76,
    net_strokes_over_par: 4, holes_played: 18, is_complete: true, tee_time: '2025-05-11T14:00:00Z',
    created_at: '2025-05-11T00:00:00Z',
    event: { id: 'evt-1', event_number: 1, name: 'Event 1' },
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

let scoresCallCount = 0;
let usersCallCount = 0;
vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'users') {
        usersCallCount++;
        // First user query is Player B (route param userId=user-b), second is Player A (vs=user-a)
        if (usersCallCount % 2 === 1) {
          return createChainProxy({ id: 'user-b', full_name: 'Rory McIlroy', email: 'rory@test.com' });
        }
        return createChainProxy({ id: 'user-a', full_name: 'Tiger Woods', email: 'tiger@test.com' });
      }
      if (table === 'scores') {
        scoresCallCount++;
        return createChainProxy(scoresCallCount % 2 === 1 ? playerAScores : playerBScores);
      }
      return createChainProxy(null);
    },
  }),
}));

import HeadToHeadPage from '@/app/(protected)/stats/[userId]/page';

describe('Arbitrary Head-to-Head via ?vs= param', () => {
  beforeEach(() => {
    scoresCallCount = 0;
    usersCallCount = 0;
    vi.clearAllMocks();
  });

  it('renders Head to Head heading', async () => {
    render(<HeadToHeadPage />);
    await waitFor(() => {
      expect(screen.getByText('Head to Head')).toBeInTheDocument();
    });
  });

  it('uses ?vs= player name instead of logged-in user', async () => {
    render(<HeadToHeadPage />);
    await waitFor(() => {
      // Player A (vs=user-a) is Tiger Woods, Player B (userId=user-b) is Rory McIlroy
      expect(screen.getByText('Tiger')).toBeInTheDocument();
      expect(screen.getByText('Rory')).toBeInTheDocument();
    });
  });

  it('shows event breakdown between the two arbitrary players', async () => {
    render(<HeadToHeadPage />);
    await waitFor(() => {
      expect(screen.getByText('Event 1')).toBeInTheDocument();
    });
  });

  it('shows 2025 Season header', async () => {
    render(<HeadToHeadPage />);
    await waitFor(() => {
      expect(screen.getByText('2025 Season')).toBeInTheDocument();
    });
  });
});
