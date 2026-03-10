import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mockRouter = { push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/scores/score-1',
  useParams: () => ({ id: 'score-1' }),
}));

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: { id: 'user-1', full_name: 'Test User', email: 'test@test.com', handicap_index: 10.0 },
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

const historicalScore = {
  id: 'score-1',
  user_id: 'user-1',
  gross_score: 85,
  net_score: 72,
  net_strokes_over_par: 0,
  scratch_strokes_over_rating: 11,
  holes_played: 18,
  is_complete: true,
  course_handicap: 13,
  points_awarded: 8,
  scratch_points_awarded: 3,
  handicap_index_used: 12.5,
  tee_time: '2024-05-10T14:00:00Z',
  submitted_by: 'user-1',
  created_at: '2024-05-10T00:00:00Z',
  event_id: 'evt-old',
  course: { course_name: 'Pine Valley', tee_name: 'Blue', type: '18_holes', par: 72, rating: 73.5, slope: 130 },
  user: { full_name: 'Test User', email: 'test@test.com', handicap_index: 10.0 },
  event: { id: 'evt-old', name: 'Event 3', start_date: '2024-05-01', end_date: '2024-05-15', event_number: 3, is_major: false, season_id: 's-old' },
};

const currentScore = {
  ...historicalScore,
  id: 'score-2',
  tee_time: '2026-03-05T14:00:00Z',
  created_at: '2026-03-05T00:00:00Z',
  event_id: 'evt-new',
  scratch_strokes_over_rating: null,
  scratch_points_awarded: null,
  handicap_index_used: null,
  event: { id: 'evt-new', name: 'Event 1', start_date: '2026-03-01', end_date: '2026-03-15', event_number: 1, is_major: false, season_id: 's-new' },
};

let mockScoreData: typeof historicalScore | typeof currentScore = historicalScore;

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
      if (table === 'scores') return createChainProxy(mockScoreData);
      if (table === 'seasons') return createChainProxy([{ id: 's-new', year: 2026, current_event_id: 'evt-new', handicap_allowance: 95 }]);
      if (table === 'events') return createChainProxy([{ id: 'evt-new', name: 'Event 1', start_date: '2026-03-01', end_date: '2026-03-15' }]);
      return createChainProxy(null);
    },
    auth: { getUser: async () => ({ data: { user: { id: 'user-1' } } }) },
    channel: () => ({ on: () => ({ subscribe: () => {} }), subscribe: () => {} }),
    removeChannel: vi.fn(),
  }),
}));

vi.mock('@/lib/hooks/useSeason', () => ({
  useSeason: () => ({
    season: { id: 's-new', year: 2026, handicap_allowance: 95 },
    currentEvent: { id: 'evt-new', name: 'Event 1', start_date: '2026-03-01', end_date: '2026-03-15' },
    isOffSeason: false,
  }),
}));

vi.mock('@/lib/slack-notify', () => ({
  notifySlack: vi.fn(),
}));

import ScoreDetailPage from '@/app/(protected)/scores/[id]/page';

describe('Score Detail — Historical Scores', () => {
  beforeEach(() => {
    mockScoreData = historicalScore;
    vi.clearAllMocks();
  });

  it('shows historical banner for pre-2026 scores', async () => {
    render(<ScoreDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Historical Score')).toBeInTheDocument();
    });
    expect(screen.getByText(/Imported from Glide/)).toBeInTheDocument();
    expect(screen.getByText(/2024 season/)).toBeInTheDocument();
  });

  it('shows handicap_index_used in the historical banner', async () => {
    render(<ScoreDetailPage />);
    await waitFor(() => {
      expect(screen.getByText(/Handicap at time of play: 12.5/)).toBeInTheDocument();
    });
  });

  it('does not show edit button for historical scores (even as admin)', async () => {
    render(<ScoreDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Historical Score')).toBeInTheDocument();
    });
    const editButtons = screen.queryAllByRole('button');
    const editButton = editButtons.find(b => b.querySelector('.lucide-edit, [data-testid="edit"]'));
    expect(editButton).toBeUndefined();
  });

  it('does not show delete button for historical scores', async () => {
    render(<ScoreDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Historical Score')).toBeInTheDocument();
    });
    expect(screen.queryByText('Delete Score')).not.toBeInTheDocument();
  });

  it('does not show Copy to Members button for historical scores', async () => {
    render(<ScoreDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Historical Score')).toBeInTheDocument();
    });
    expect(screen.queryByText('Copy to Members')).not.toBeInTheDocument();
  });

  it('does not show handicap breakdown for historical scores', async () => {
    render(<ScoreDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Historical Score')).toBeInTheDocument();
    });
    expect(screen.queryByText('Score Needed to shoot Net E')).not.toBeInTheDocument();
  });

  it('shows scratch score for historical scores', async () => {
    render(<ScoreDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Scratch')).toBeInTheDocument();
    });
    expect(screen.getByText('+11')).toBeInTheDocument();
  });

  it('shows both net and scratch points for historical scores', async () => {
    render(<ScoreDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Net Points')).toBeInTheDocument();
    });
    expect(screen.getByText('8')).toBeInTheDocument();
    expect(screen.getByText('Scratch Points')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('does not show historical banner for 2026 scores', async () => {
    mockScoreData = currentScore;
    render(<ScoreDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Round Detail')).toBeInTheDocument();
    });
    expect(screen.queryByText('Historical Score')).not.toBeInTheDocument();
  });

  it('shows scoring differential instead of scratch for current scores', async () => {
    mockScoreData = currentScore;
    render(<ScoreDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Scoring Differential')).toBeInTheDocument();
    });
    expect(screen.queryByText('Scratch')).not.toBeInTheDocument();
  });

  it('shows delete and copy buttons for current scores', async () => {
    mockScoreData = currentScore;
    render(<ScoreDetailPage />);
    await waitFor(() => {
      expect(screen.getByText('Round Detail')).toBeInTheDocument();
    });
    expect(screen.getByText('Delete Score')).toBeInTheDocument();
    expect(screen.getByText('Copy to Members')).toBeInTheDocument();
  });
});
