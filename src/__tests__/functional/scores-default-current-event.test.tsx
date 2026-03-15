import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockRouter = { push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => mockSearchParams,
  usePathname: () => '/scores',
  useParams: () => ({}),
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
    season: { id: 's-1', year: 2025, mode: 'regular_season' },
    currentEvent: { id: 'evt-2025-3', name: 'Event 3', start_date: '2025-08-01', end_date: '2025-09-30', event_number: 3, season_id: 's-1' },
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

const completedScores = [
  {
    id: 'score-c1',
    user_id: 'user-1',
    gross_score: 85,
    net_score: 72,
    net_strokes_over_par: 0,
    holes_played: 18,
    is_complete: true,
    course_handicap: 13,
    tee_time: '2025-08-10T14:00:00Z',
    created_at: '2025-08-10T00:00:00Z',
    event_id: 'evt-2025-3',
    course: { course_name: 'Pine Valley', tee_name: 'Blue', type: '18_holes', par: 72, rating: 72.5, slope: 130 },
    user: { full_name: 'Jason Richards', email: 'jason@test.com', profile_picture_url: null, handicap_index: 15.0 },
    event: { id: 'evt-2025-3', name: 'Event 3', start_date: '2025-08-01', end_date: '2025-09-30', event_number: 3, season_id: 's-1', is_major: false },
  },
  {
    id: 'score-c2',
    user_id: 'user-2',
    gross_score: 90,
    net_score: 75,
    net_strokes_over_par: 3,
    holes_played: 18,
    is_complete: true,
    course_handicap: 15,
    tee_time: '2025-06-07T09:30:00Z',
    created_at: '2025-06-07T00:00:00Z',
    event_id: 'evt-2025-4',
    course: { course_name: 'Augusta National', tee_name: 'Gold', type: '18_holes', par: 72, rating: 74.0, slope: 137 },
    user: { full_name: 'Tiger Woods', email: 'tiger@test.com', profile_picture_url: null, handicap_index: 5.0 },
    event: { id: 'evt-2025-4', name: 'Event 4', start_date: '2025-06-01', end_date: '2025-06-15', event_number: 4, season_id: 's-1', is_major: false },
  },
];

const teeTimeScores = [
  {
    id: 'score-t1',
    user_id: 'user-1',
    gross_score: null,
    net_score: null,
    net_strokes_over_par: null,
    holes_played: 18,
    is_complete: false,
    course_handicap: null,
    tee_time: '2025-09-15T08:00:00Z',
    created_at: '2025-09-10T00:00:00Z',
    event_id: 'evt-2025-3',
    course: { course_name: 'Torrey Pines', tee_name: 'South', type: '18_holes', par: 72, rating: 74.6, slope: 143 },
    user: { full_name: 'Jason Richards', email: 'jason@test.com', profile_picture_url: null, handicap_index: 15.0 },
    event: { id: 'evt-2025-3', name: 'Event 3', start_date: '2025-08-01', end_date: '2025-09-30', event_number: 3, season_id: 's-1', is_major: false },
  },
];

vi.mock('swr', () => ({
  default: (key: string | unknown[]) => {
    const k = typeof key === 'string' ? key : key?.[0];
    if (k === 'seasons-years') {
      return { data: [2025, 2024], isLoading: false, error: null, mutate: vi.fn() };
    }
    const tab = Array.isArray(key) ? key[1] : null;
    const data = tab === 'teetimes' ? teeTimeScores : completedScores;
    return { data, isLoading: false, error: null, mutate: vi.fn() };
  },
}));

import ScoresPage from '@/app/(protected)/scores/page';

describe('Scores Page - Default to Current Event', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    vi.clearAllMocks();
  });

  it('auto-selects the current event on initial load', async () => {
    render(<ScoresPage />);

    await waitFor(() => {
      expect(screen.getByText('Pine Valley')).toBeInTheDocument();
      expect(screen.queryByText('Augusta National')).not.toBeInTheDocument();
    });

    const selects = screen.getAllByRole('combobox');
    const eventSelect = selects[1];
    expect(eventSelect).toHaveValue('evt-2025-3');
  });

  it('auto-selects the current event on Tee Times tab too', async () => {
    render(<ScoresPage />);

    await waitFor(() => {
      expect(screen.getAllByRole('combobox')[1]).toHaveValue('evt-2025-3');
    });

    fireEvent.click(screen.getByText('Tee Times'));

    await waitFor(() => {
      expect(screen.getByText('Torrey Pines')).toBeInTheDocument();
    });
  });

  it('allows user to override the default by selecting a different event', async () => {
    render(<ScoresPage />);

    await waitFor(() => {
      expect(screen.getAllByRole('combobox')[1]).toHaveValue('evt-2025-3');
    });

    const eventSelect = screen.getAllByRole('combobox')[1];
    fireEvent.change(eventSelect, { target: { value: 'all' } });

    await waitFor(() => {
      expect(screen.getByText('Pine Valley')).toBeInTheDocument();
      expect(screen.getByText('Augusta National')).toBeInTheDocument();
    });
  });

  it('retains the current-event default across tab switches', async () => {
    render(<ScoresPage />);

    await waitFor(() => {
      expect(screen.getAllByRole('combobox')[1]).toHaveValue('evt-2025-3');
    });

    fireEvent.click(screen.getByText('Tee Times'));

    await waitFor(() => {
      expect(screen.getByText('Torrey Pines')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Completed'));

    await waitFor(() => {
      expect(screen.getByText('Pine Valley')).toBeInTheDocument();
      expect(screen.queryByText('Augusta National')).not.toBeInTheDocument();
    });
  });
});
