import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────
const mockRouter = { push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/scores',
  useParams: () => ({ id: 'score-1' }),
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

vi.mock('@/lib/hooks/useSeason', () => ({
  useSeason: () => ({
    season: { id: 's-1', mode: 'regular_season' },
    currentEvent: null,
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

// Mock SWR to return controlled data
const mockScores = [
  {
    id: 'score-1',
    user_id: 'user-1',
    gross_score: 85,
    net_score: 72,
    net_strokes_over_par: 0,
    holes_played: 18,
    is_complete: true,
    course_handicap: 13,
    tee_time: '2025-05-10T14:00:00Z',
    created_at: '2026-02-15T00:00:00Z',
    event_id: 'evt-1',
    course: { course_name: 'Pine Valley', tee_name: 'Blue', type: '18_holes', par: 72, rating: 72.5, slope: 130 },
    user: { full_name: 'Jason Richards', email: 'jason@test.com', profile_picture_url: null },
    event: { name: 'Event 3', start_date: '2025-05-01', end_date: '2025-05-15', event_number: 3, is_major: false },
  },
  {
    id: 'score-2',
    user_id: 'user-2',
    gross_score: 90,
    net_score: 75,
    net_strokes_over_par: 3,
    holes_played: 18,
    is_complete: true,
    course_handicap: 15,
    tee_time: '2025-06-07T09:30:00Z',
    created_at: '2026-02-15T00:00:00Z',
    event_id: 'evt-2',
    course: { course_name: 'Augusta National', tee_name: 'Gold', type: '18_holes', par: 72, rating: 74.0, slope: 137 },
    user: { full_name: 'Tiger Woods', email: 'tiger@test.com', profile_picture_url: null },
    event: { name: 'Event 4', start_date: '2025-06-01', end_date: '2025-06-15', event_number: 4, is_major: false },
  },
  {
    id: 'score-3',
    user_id: 'user-1',
    gross_score: 78,
    net_score: 65,
    net_strokes_over_par: -7,
    holes_played: 18,
    is_complete: true,
    course_handicap: 13,
    tee_time: '2026-01-20T14:30:00Z',
    created_at: '2026-01-20T00:00:00Z',
    event_id: null,
    course: { course_name: 'Pebble Beach', tee_name: 'White', type: '18_holes', par: 72, rating: 71.0, slope: 125 },
    user: { full_name: 'Jason Richards', email: 'jason@test.com', profile_picture_url: null },
    event: null,
  },
];

vi.mock('swr', () => ({
  default: (key: unknown, fetcher: unknown, opts: unknown) => ({
    data: mockScores,
    isLoading: false,
    error: null,
    mutate: vi.fn(),
  }),
}));

// Import pages AFTER mocks are set up
import ScoresPage from '@/app/(protected)/scores/page';

describe('Scores Page - My Rounds Filter', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    vi.clearAllMocks();
  });

  it('renders the My Rounds button', () => {
    render(<ScoresPage />);
    expect(screen.getByText('My Rounds')).toBeInTheDocument();
  });

  it('My Rounds button is not active by default (no player param)', () => {
    render(<ScoresPage />);
    const btn = screen.getByText('My Rounds');
    // Not active: should have card bg styling (inactive state)
    expect(btn.className).toContain('bg-[var(--bg-card)]');
    expect(btn.className).not.toContain('bg-minerva-600');
  });

  it('shows all scores when My Rounds is not active and All Years selected', async () => {
    render(<ScoresPage />);
    // Select "All Years" to see all scores across years
    const yearSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(yearSelect, { target: { value: 'all' } });
    await waitFor(() => {
      expect(screen.getByText('Pine Valley')).toBeInTheDocument();
      expect(screen.getByText('Augusta National')).toBeInTheDocument();
      expect(screen.getByText('Pebble Beach')).toBeInTheDocument();
    });
  });

  it('filters to current user scores when My Rounds is clicked', async () => {
    render(<ScoresPage />);
    // Select "All Years" first to see all scores
    const yearSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(yearSelect, { target: { value: 'all' } });
    const btn = screen.getByText('My Rounds');
    fireEvent.click(btn);

    await waitFor(() => {
      // Jason Richards' scores (user-1) should show
      expect(screen.getByText('Pine Valley')).toBeInTheDocument();
      expect(screen.getByText('Pebble Beach')).toBeInTheDocument();
      // Tiger Woods' score (user-2) should be hidden
      expect(screen.queryByText('Augusta National')).not.toBeInTheDocument();
    });
  });

  it('My Rounds is pre-activated when player param is present', () => {
    mockSearchParams = new URLSearchParams('player=user-1');
    render(<ScoresPage />);
    const btn = screen.getByText('My Rounds');
    // Active state
    expect(btn.className).toContain('bg-minerva-600');
  });

  it('toggles My Rounds off after clicking twice', async () => {
    render(<ScoresPage />);
    // Select "All Years" to see all scores
    const yearSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(yearSelect, { target: { value: 'all' } });
    const btn = screen.getByText('My Rounds');
    fireEvent.click(btn); // on
    fireEvent.click(btn); // off

    await waitFor(() => {
      // All scores should be visible again
      expect(screen.getByText('Pine Valley')).toBeInTheDocument();
      expect(screen.getByText('Augusta National')).toBeInTheDocument();
      expect(screen.getByText('Pebble Beach')).toBeInTheDocument();
    });
  });
});

describe('Scores Page - Date Display', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    vi.clearAllMocks();
  });

  it('displays tee_time date (actual round date) over event start_date', async () => {
    render(<ScoresPage />);
    // Select All Years so we can see 2025 scores too
    const yearSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(yearSelect, { target: { value: 'all' } });
    await waitFor(() => {
      // score-1 tee_time: 2025-05-10 (event start was 2025-05-01) → should show "May 10, 2025"
      expect(screen.getByText(/May 10, 2025/)).toBeInTheDocument();
      // score-2 tee_time: 2025-06-07 (event start was 2025-06-01) → should show "Jun 7, 2025"
      expect(screen.getByText(/Jun 7, 2025/)).toBeInTheDocument();
    });
  });

  it('displays tee_time date for scores without events', async () => {
    render(<ScoresPage />);
    // Default year is 2026 which has score-3
    await waitFor(() => {
      // score-3 has tee_time: '2026-01-20T14:30:00Z' → "Jan 20, 2026"
      expect(screen.getByText(/Jan 20, 2026/)).toBeInTheDocument();
    });
  });

  it('does NOT show Feb 15, 2026 (import date) for any scores', async () => {
    render(<ScoresPage />);
    const yearSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(yearSelect, { target: { value: 'all' } });
    await waitFor(() => {
      const feb15Elements = screen.queryAllByText(/Feb 15, 2026/);
      expect(feb15Elements.length).toBe(0);
    });
  });

  it('does NOT show event start_date when tee_time is available', async () => {
    render(<ScoresPage />);
    const yearSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(yearSelect, { target: { value: 'all' } });
    await waitFor(() => {
      // Event 3 start_date was May 1 — should NOT appear since tee_time is May 10
      expect(screen.queryByText(/May 1, 2025/)).not.toBeInTheDocument();
      // Event 4 start_date was Jun 1 — should NOT appear since tee_time is Jun 7
      expect(screen.queryByText(/Jun 1, 2025/)).not.toBeInTheDocument();
    });
  });
});

describe('Scores Page - Search', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    vi.clearAllMocks();
  });

  it('renders search input', () => {
    render(<ScoresPage />);
    expect(screen.getByPlaceholderText('Search by course, player...')).toBeInTheDocument();
  });

  it('filters by course name', async () => {
    render(<ScoresPage />);
    // Show all years first
    const yearSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(yearSelect, { target: { value: 'all' } });
    const input = screen.getByPlaceholderText('Search by course, player...');
    fireEvent.change(input, { target: { value: 'pine' } });

    await waitFor(() => {
      expect(screen.getByText('Pine Valley')).toBeInTheDocument();
      expect(screen.queryByText('Augusta National')).not.toBeInTheDocument();
    });
  });

  it('filters by player name', async () => {
    render(<ScoresPage />);
    const yearSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(yearSelect, { target: { value: 'all' } });
    const input = screen.getByPlaceholderText('Search by course, player...');
    fireEvent.change(input, { target: { value: 'tiger' } });

    await waitFor(() => {
      expect(screen.queryByText('Pine Valley')).not.toBeInTheDocument();
      expect(screen.getByText('Augusta National')).toBeInTheDocument();
    });
  });

  it('search and My Rounds filter work together', async () => {
    render(<ScoresPage />);
    const yearSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(yearSelect, { target: { value: 'all' } });

    // Activate My Rounds
    fireEvent.click(screen.getByText('My Rounds'));

    // Now search for "pebble" within my rounds
    const input = screen.getByPlaceholderText('Search by course, player...');
    fireEvent.change(input, { target: { value: 'pebble' } });

    await waitFor(() => {
      expect(screen.getByText('Pebble Beach')).toBeInTheDocument();
      expect(screen.queryByText('Pine Valley')).not.toBeInTheDocument();
      expect(screen.queryByText('Augusta National')).not.toBeInTheDocument();
    });
  });
});
