import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

// ── Shared Mocks ──────────────────────────────────────────────
const mockRouter = { push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/scores/score-1',
  useParams: () => ({ id: 'score-1' }),
}));

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: { id: 'user-1', full_name: 'Jason Richards', email: 'jason@test.com', handicap_index: 15.0 },
    authUser: { id: 'user-1' },
    loading: false,
    isAdmin: true,
    isMember: true,
    isPlayingGuest: false,
    isAuthenticated: true,
  }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

// ── Score fixtures ──────────────────────────────────────────────
const scoreWithEvent = {
  id: 'score-1',
  user_id: 'user-1',
  gross_score: 85,
  net_score: 72,
  net_strokes_over_par: 0,
  holes_played: 18,
  is_complete: true,
  course_handicap: 13,
  points_awarded: 10,
  tee_time: '2025-05-10T14:00:00Z',
  submitted_by: 'user-1',
  created_at: '2026-02-15T00:00:00Z',
  event_id: 'evt-3',
  course: { course_name: 'Pine Valley', tee_name: 'Blue', type: '18_holes', par: 72, rating: 72.5, slope: 130 },
  user: { full_name: 'Jason Richards', email: 'jason@test.com', handicap_index: 15.0 },
  event: { id: 'evt-3', name: 'Event 3', start_date: '2025-05-01', end_date: '2025-05-15', event_number: 3, is_major: false, season_id: 's-1' },
};

const scoreWithTeeTime = {
  ...scoreWithEvent,
  id: 'score-2',
  tee_time: '2026-01-20T14:30:00Z',
  event_id: null,
  event: null,
};

const scoreWithDateOnly = {
  ...scoreWithEvent,
  id: 'score-3',
  tee_time: '2026-03-07T00:00:00Z',
};

// ── Mutable mock data ref ─────────────────────────────────────
let mockScoreData: typeof scoreWithEvent | typeof scoreWithTeeTime | typeof scoreWithDateOnly = scoreWithEvent;

// Build a recursive proxy for chaining any Supabase method
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
              single: () => Promise.resolve({ data: mockScoreData, error: null }),
            }),
          }),
          update: () => createChainProxy(null),
          delete: () => createChainProxy(null),
        };
      }
      if (table === 'seasons') {
        return createChainProxy([{ id: 's-1' }]);
      }
      if (table === 'events') {
        return createChainProxy([]);
      }
      return createChainProxy(null);
    },
  }),
}));

import ScoreDetailPage from '@/app/(protected)/scores/[id]/page';

describe('Score Detail Page - Subheader & Footer', () => {
  beforeEach(() => {
    mockScoreData = scoreWithEvent;
    vi.clearAllMocks();
  });

  it('renders loading state initially', () => {
    const { container } = render(<ScoreDetailPage />);
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });

  it('shows tee time date in condensed subheader (not event start_date)', async () => {
    mockScoreData = scoreWithEvent;
    render(<ScoreDetailPage />);

    // tee_time: 2025-05-10 should show in the condensed subheader
    const match = await screen.findByText(/May 10, 2025/);
    expect(match).toBeInTheDocument();
    // Event start_date (May 1) should NOT appear
    expect(screen.queryByText(/May 1, 2025/)).not.toBeInTheDocument();
  });

  it('shows tee_time date for scores without events', async () => {
    mockScoreData = scoreWithTeeTime;
    render(<ScoreDetailPage />);

    // tee_time: '2026-01-20T14:30:00Z' in condensed subheader (short month format)
    const match = await screen.findByText(/Jan 20, 2026/);
    expect(match).toBeInTheDocument();
  });

  it('shows created_at in footer, not in subheader', async () => {
    mockScoreData = scoreWithEvent;
    render(<ScoreDetailPage />);

    await screen.findByText(/May 10, 2025/);
    // created_at (Feb 15, 2026) should appear in "Created on" footer
    expect(screen.getByText(/Created on/)).toBeInTheDocument();
    expect(screen.getByText(/Feb 15, 2026/)).toBeInTheDocument();
    // Event start_date should not appear
    expect(screen.queryByText(/May 1, 2025/)).not.toBeInTheDocument();
  });

  it('shows event name in condensed subheader', async () => {
    mockScoreData = scoreWithEvent;
    render(<ScoreDetailPage />);
    expect(await screen.findByText(/Event 3/)).toBeInTheDocument();
  });

  it('shows course info', async () => {
    mockScoreData = scoreWithEvent;
    render(<ScoreDetailPage />);
    expect(await screen.findByText('Pine Valley')).toBeInTheDocument();
  });

  it('shows player name in condensed subheader', async () => {
    mockScoreData = scoreWithEvent;
    render(<ScoreDetailPage />);
    expect(await screen.findByText(/Jason Richards/)).toBeInTheDocument();
  });

  it('shows time in subheader when tee_time has a non-midnight time', async () => {
    mockScoreData = scoreWithTeeTime;
    render(<ScoreDetailPage />);
    await screen.findByText(/Jan 20, 2026/);
    expect(screen.getByText(/2:30/)).toBeInTheDocument();
  });

  it('does not show time in subheader for date-only tee_time (midnight UTC)', async () => {
    mockScoreData = scoreWithDateOnly;
    render(<ScoreDetailPage />);
    const el = await screen.findByText(/Mar 7, 2026/);
    expect(el.textContent).not.toMatch(/\d{1,2}:\d{2}\s*.?[AP]M/i);
  });
});
