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
    profile: { id: 'user-1', full_name: 'Test User', email: 'test@test.com', handicap_index: 12.0 },
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
    season: { id: 's-1', year: 2026, mode: 'regular_season' },
    currentEvent: { id: 'evt-1', name: 'Event 1', event_number: 1 },
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

const eventScore = {
  id: 'score-with-event',
  user_id: 'user-1',
  event_id: 'evt-1',
  gross_score: 85,
  net_score: 72,
  net_strokes_over_par: 0,
  holes_played: 18,
  is_complete: true,
  course_handicap: 13,
  tee_time: '2026-03-10T14:00:00Z',
  created_at: '2026-03-10T14:00:00Z',
  course: { course_name: 'Eagle Creek', tee_name: 'Blue', type: '18_holes', par: 72, rating: 72.5, slope: 130 },
  user: { full_name: 'Test User', email: 'test@test.com', profile_picture_url: null, handicap_index: 12.0 },
  event: { id: 'evt-1', name: 'Event 1', start_date: '2026-03-02', end_date: '2026-03-15', event_number: 1, is_major: false },
};

const noEventScore = {
  id: 'score-no-event',
  user_id: 'user-1',
  event_id: null,
  gross_score: 90,
  net_score: 78,
  net_strokes_over_par: 6,
  holes_played: 18,
  is_complete: true,
  course_handicap: 12,
  tee_time: '2026-02-20T10:00:00Z',
  created_at: '2026-02-20T10:00:00Z',
  course: { course_name: 'Pine Hills', tee_name: 'White', type: '18_holes', par: 72, rating: 70.0, slope: 120 },
  user: { full_name: 'Test User', email: 'test@test.com', profile_picture_url: null, handicap_index: 12.0 },
  event: null,
};

const allScores = [eventScore, noEventScore];

vi.mock('swr', () => ({
  default: (key: string | unknown[]) => {
    const k = typeof key === 'string' ? key : key?.[0];
    if (k === 'seasons-years') {
      return { data: [2026], isLoading: false, error: null, mutate: vi.fn() };
    }
    return { data: allScores, isLoading: false, error: null, mutate: vi.fn() };
  },
}));

import ScoresPage from '@/app/(protected)/scores/page';

describe('Scores Page - No Event Scores', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    vi.clearAllMocks();
  });

  it('displays both event and non-event scores when "All Events" is active', async () => {
    render(<ScoresPage />);
    await waitFor(() => {
      expect(screen.getByText('All Events')).toBeInTheDocument();
    });

    // The page auto-defaults to the current event; switch to All Events
    const selects = screen.getAllByRole('combobox');
    const eventSelect = selects[1];
    fireEvent.change(eventSelect, { target: { value: 'all' } });

    await waitFor(() => {
      expect(screen.getByText('Eagle Creek')).toBeInTheDocument();
      expect(screen.getByText('Pine Hills')).toBeInTheDocument();
    });
  });

  it('shows a "No Event" option in the event filter dropdown', async () => {
    render(<ScoresPage />);
    await waitFor(() => {
      expect(screen.getByText('No Event')).toBeInTheDocument();
    });
  });

  it('filters to only non-event scores when "No Event" is selected', async () => {
    render(<ScoresPage />);
    await waitFor(() => {
      expect(screen.getByText('All Events')).toBeInTheDocument();
    });

    const selects = screen.getAllByRole('combobox');
    const eventSelect = selects[1];
    fireEvent.change(eventSelect, { target: { value: 'no-event' } });

    await waitFor(() => {
      expect(screen.getByText('Pine Hills')).toBeInTheDocument();
      expect(screen.queryByText('Eagle Creek')).not.toBeInTheDocument();
    });
  });

  it('filters to only event scores when a specific event is selected', async () => {
    render(<ScoresPage />);
    await waitFor(() => {
      expect(screen.getByText('All Events')).toBeInTheDocument();
    });

    const selects = screen.getAllByRole('combobox');
    const eventSelect = selects[1];
    fireEvent.change(eventSelect, { target: { value: 'evt-1' } });

    await waitFor(() => {
      expect(screen.getByText('Eagle Creek')).toBeInTheDocument();
      expect(screen.queryByText('Pine Hills')).not.toBeInTheDocument();
    });
  });

  it('shows all scores (event + non-event) when "All Events" is selected', async () => {
    render(<ScoresPage />);

    // First select a specific filter
    await waitFor(() => {
      expect(screen.getByText('All Events')).toBeInTheDocument();
    });
    const selects = screen.getAllByRole('combobox');
    const eventSelect = selects[1];
    fireEvent.change(eventSelect, { target: { value: 'no-event' } });

    // Then switch back to All Events
    fireEvent.change(eventSelect, { target: { value: 'all' } });

    await waitFor(() => {
      expect(screen.getByText('Eagle Creek')).toBeInTheDocument();
      expect(screen.getByText('Pine Hills')).toBeInTheDocument();
    });
  });
});
