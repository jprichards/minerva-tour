import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

const mockScores = [
  {
    id: 'score-2025a',
    user_id: 'user-1',
    gross_score: 85,
    net_score: 72,
    net_strokes_over_par: 0,
    holes_played: 18,
    is_complete: true,
    course_handicap: 13,
    tee_time: '2025-08-10T14:00:00Z',
    created_at: '2026-02-15T00:00:00Z',
    event_id: 'evt-2025-3',
    course: { course_name: 'Pine Valley', tee_name: 'Blue', type: '18_holes', par: 72, rating: 72.5, slope: 130 },
    user: { full_name: 'Jason Richards', email: 'jason@test.com', profile_picture_url: null },
    event: { id: 'evt-2025-3', name: 'Event 3', start_date: '2025-08-01', end_date: '2025-08-15', event_number: 3, is_major: false },
  },
  {
    id: 'score-2025b',
    user_id: 'user-2',
    gross_score: 90,
    net_score: 75,
    net_strokes_over_par: 3,
    holes_played: 18,
    is_complete: true,
    course_handicap: 15,
    tee_time: '2025-06-07T09:30:00Z',
    created_at: '2026-02-15T00:00:00Z',
    event_id: 'evt-2025-4',
    course: { course_name: 'Augusta National', tee_name: 'Gold', type: '18_holes', par: 72, rating: 74.0, slope: 137 },
    user: { full_name: 'Tiger Woods', email: 'tiger@test.com', profile_picture_url: null },
    event: { id: 'evt-2025-4', name: 'Event 4 (Major)', start_date: '2025-06-01', end_date: '2025-06-15', event_number: 4, is_major: true },
  },
  {
    id: 'score-2024a',
    user_id: 'user-1',
    gross_score: 78,
    net_score: 65,
    net_strokes_over_par: -7,
    holes_played: 18,
    is_complete: true,
    course_handicap: 13,
    tee_time: '2024-07-20T14:30:00Z',
    created_at: '2026-02-15T00:00:00Z',
    event_id: 'evt-2024-1',
    course: { course_name: 'Pebble Beach', tee_name: 'White', type: '18_holes', par: 72, rating: 71.0, slope: 125 },
    user: { full_name: 'Jason Richards', email: 'jason@test.com', profile_picture_url: null },
    event: { id: 'evt-2024-1', name: 'Event 1', start_date: '2024-07-15', end_date: '2024-07-30', event_number: 1, is_major: false },
  },
];

vi.mock('swr', () => ({
  default: () => ({
    data: mockScores,
    isLoading: false,
    error: null,
    mutate: vi.fn(),
  }),
}));

import ScoresPage from '@/app/(protected)/scores/page';

describe('Scores Page - Year Filter', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    vi.clearAllMocks();
  });

  it('renders the year filter dropdown', () => {
    render(<ScoresPage />);
    const yearSelect = screen.getAllByRole('combobox')[0];
    expect(yearSelect).toBeInTheDocument();
  });

  it('defaults to the most recent year with scores (2025)', async () => {
    render(<ScoresPage />);
    await waitFor(() => {
      // 2025 scores should be visible
      expect(screen.getByText('Pine Valley')).toBeInTheDocument();
      expect(screen.getByText('Augusta National')).toBeInTheDocument();
    });
  });

  it('shows All Years option', () => {
    render(<ScoresPage />);
    expect(screen.getByText('All Years')).toBeInTheDocument();
  });

  it('filters to a specific year when selected', async () => {
    render(<ScoresPage />);
    const yearSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(yearSelect, { target: { value: '2024' } });

    await waitFor(() => {
      expect(screen.getByText('Pebble Beach')).toBeInTheDocument();
      expect(screen.queryByText('Pine Valley')).not.toBeInTheDocument();
      expect(screen.queryByText('Augusta National')).not.toBeInTheDocument();
    });
  });

  it('shows all scores when All Years is selected', async () => {
    render(<ScoresPage />);
    const yearSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(yearSelect, { target: { value: 'all' } });

    await waitFor(() => {
      expect(screen.getByText('Pine Valley')).toBeInTheDocument();
      expect(screen.getByText('Augusta National')).toBeInTheDocument();
      expect(screen.getByText('Pebble Beach')).toBeInTheDocument();
    });
  });
});

describe('Scores Page - Event Filter', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    vi.clearAllMocks();
  });

  it('shows All Events dropdown when a year is selected', async () => {
    render(<ScoresPage />);
    await waitFor(() => {
      expect(screen.getByText('All Events')).toBeInTheDocument();
    });
  });

  it('filters to a specific event when selected', async () => {
    render(<ScoresPage />);
    await waitFor(() => {
      expect(screen.getByText('All Events')).toBeInTheDocument();
    });

    // Find the event dropdown (second combobox)
    const selects = screen.getAllByRole('combobox');
    const eventSelect = selects[1];
    fireEvent.change(eventSelect, { target: { value: 'evt-2025-3' } });

    await waitFor(() => {
      expect(screen.getByText('Pine Valley')).toBeInTheDocument();
      expect(screen.queryByText('Augusta National')).not.toBeInTheDocument();
    });
  });

  it('resets event filter when year changes', async () => {
    render(<ScoresPage />);
    await waitFor(() => {
      expect(screen.getByText('All Events')).toBeInTheDocument();
    });

    // Select a specific event
    const selects = screen.getAllByRole('combobox');
    fireEvent.change(selects[1], { target: { value: 'evt-2025-3' } });

    // Change year — event filter should reset
    fireEvent.change(selects[0], { target: { value: 'all' } });

    await waitFor(() => {
      expect(screen.getByText('Pine Valley')).toBeInTheDocument();
      expect(screen.getByText('Augusta National')).toBeInTheDocument();
      expect(screen.getByText('Pebble Beach')).toBeInTheDocument();
    });
  });
});

describe('Scores Page - Event Name Display', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    vi.clearAllMocks();
  });

  it('shows event name on score cards', async () => {
    render(<ScoresPage />);
    const yearSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(yearSelect, { target: { value: 'all' } });

    await waitFor(() => {
      expect(screen.getByText('Event 3')).toBeInTheDocument();
      expect(screen.getByText('Event 4 (Major)')).toBeInTheDocument();
      expect(screen.getByText('Event 1')).toBeInTheDocument();
    });
  });
});
