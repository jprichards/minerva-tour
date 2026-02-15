import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/home',
  useParams: () => ({}),
}));

const mockProfile = {
  id: 'user-abc-123',
  full_name: 'Jason Richards',
  email: 'jason@test.com',
  role: 'member',
  handicap_index: 15.0,
};

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: mockProfile,
    authUser: { id: 'user-abc-123' },
    loading: false,
    isAdmin: false,
    isMember: true,
    isPlayingGuest: false,
    isAuthenticated: true,
  }),
}));

vi.mock('@/lib/hooks/useSeason', () => ({
  useSeason: () => ({
    season: { id: 's-1', mode: 'regular_season', year: 2025 },
    currentEvent: { id: 'evt-1', name: 'Event 5', event_number: 5, start_date: '2025-07-01', end_date: '2025-07-15' },
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

vi.mock('@/components/navigation/NotificationBell', () => ({
  default: () => <div data-testid="notification-bell" />,
}));

// Mock Supabase client to return scores with event data
const mockScores = [
  {
    id: 'score-1',
    user_id: 'user-abc-123',
    gross_score: 85,
    net_score: 72,
    net_strokes_over_par: 0,
    holes_played: 18,
    is_complete: true,
    tee_time: null,
    created_at: '2026-02-15T00:00:00Z',
    course: { course_name: 'Torrey Pines', tee_name: 'Blue', type: '18_holes', par: 72 },
    event: { start_date: '2025-07-01', end_date: '2025-07-15' },
  },
];

// Build a recursive proxy that returns itself for any chained method,
// and resolves to { data: null/[], error: null } on await
function createChainProxy(resolveData: unknown = null): unknown {
  const handler: ProxyHandler<CallableFunction> = {
    get(_target, prop) {
      if (prop === 'then') {
        // Makes the proxy thenable — resolves with { data, error }
        return (resolve: (v: unknown) => void) => resolve({ data: resolveData, error: null });
      }
      // Return a function that returns another proxy (for chaining)
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
        return createChainProxy(mockScores);
      }
      if (table === 'seasons') {
        return createChainProxy([{ id: 's-1', current_event_id: 'evt-1', mode: 'regular_season', year: 2025 }]);
      }
      if (table === 'events') {
        return createChainProxy({ id: 'evt-1', name: 'Event 5', event_number: 5, start_date: '2025-07-01', end_date: '2025-07-15' });
      }
      if (table === 'app_settings') {
        return createChainProxy(null);
      }
      return createChainProxy(null);
    },
  }),
}));

import HomePage from '@/app/(protected)/home/page';

describe('Home Page - View All Link', () => {
  it('renders the View all link with player filter param', async () => {
    render(<HomePage />);

    // Wait for data to load and "View all" to appear
    const viewAllLink = await screen.findByText('View all', {}, { timeout: 3000 });
    expect(viewAllLink).toBeInTheDocument();

    // The link should navigate to /scores?player=user-abc-123
    const anchor = viewAllLink.closest('a');
    expect(anchor).toHaveAttribute('href', '/scores?player=user-abc-123');
  });

  it('shows Recent Rounds heading when scores exist', async () => {
    render(<HomePage />);
    expect(await screen.findByText('Recent Rounds', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('displays event date on recent score cards', async () => {
    render(<HomePage />);

    // Event start_date: 2025-07-01 → "Jul 1, 2025"
    expect(await screen.findByText(/Jul 1, 2025/, {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('displays course name on recent score cards', async () => {
    render(<HomePage />);
    expect(await screen.findByText('Torrey Pines', {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('does NOT use import date (Feb 15 2026) on score cards', async () => {
    render(<HomePage />);
    // Wait for scores to load
    await screen.findByText('Torrey Pines', {}, { timeout: 3000 });

    // The import date should not appear
    expect(screen.queryByText(/Feb 15, 2026/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Feb 14, 2026/)).not.toBeInTheDocument();
  });
});
