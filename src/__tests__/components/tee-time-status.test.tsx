import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

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

let mockSwrData: unknown[] = [];

vi.mock('swr', () => ({
  default: () => ({
    data: mockSwrData,
    isLoading: false,
    error: null,
    mutate: vi.fn(),
  }),
}));

import ScoresPage from '@/app/(protected)/scores/page';

const completedScore = {
  id: 'score-complete',
  user_id: 'user-1',
  gross_score: 85,
  net_score: 72,
  net_strokes_over_par: 0,
  holes_played: 18,
  is_complete: true,
  course_handicap: 13,
  tee_time: '2026-03-01T14:00:00Z',
  created_at: '2026-03-01T00:00:00Z',
  event_id: null,
  course: { course_name: 'Pine Valley', tee_name: 'Blue', type: '18_holes', par: 72 },
  user: { full_name: 'Jason Richards', email: 'jason@test.com', profile_picture_url: null },
  event: null,
};

const notStartedScore = {
  id: 'score-not-started',
  user_id: 'user-1',
  gross_score: null,
  net_score: null,
  net_strokes_over_par: null,
  holes_played: null,
  is_complete: false,
  course_handicap: null,
  tee_time: '2026-03-10T10:00:00Z',
  created_at: '2026-03-05T00:00:00Z',
  event_id: null,
  course: { course_name: 'Augusta National', tee_name: 'Gold', type: '18_holes', par: 72 },
  user: { full_name: 'Jason Richards', email: 'jason@test.com', profile_picture_url: null },
  event: null,
};

const inProgressScore = {
  id: 'score-in-progress',
  user_id: 'user-1',
  gross_score: 42,
  net_score: null,
  net_strokes_over_par: null,
  holes_played: 9,
  is_complete: false,
  course_handicap: 13,
  tee_time: '2026-03-07T08:00:00Z',
  created_at: '2026-03-07T00:00:00Z',
  event_id: null,
  course: { course_name: 'Pebble Beach', tee_name: 'White', type: '18_holes', par: 72, rating: 72.0, slope: 130 },
  user: { full_name: 'Jason Richards', email: 'jason@test.com', profile_picture_url: null, handicap_index: 15.0 },
  event: null,
};

describe('Tee Time Status Pills', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams('tab=teetimes');
    vi.clearAllMocks();
  });

  it('shows yellow "Pending" pill for not-started tee times', async () => {
    mockSwrData = [notStartedScore];
    render(<ScoresPage />);

    const pill = await screen.findByText('Pending');
    expect(pill).toBeInTheDocument();
    expect(pill.className).toContain('bg-amber-100');
    expect(pill.className).toContain('text-amber-700');
  });

  it('shows blue "In Progress" pill for partial scores', async () => {
    mockSwrData = [inProgressScore];
    render(<ScoresPage />);

    const pill = await screen.findByText('In Progress');
    expect(pill).toBeInTheDocument();
    expect(pill.className).toContain('bg-blue-100');
    expect(pill.className).toContain('text-blue-700');
  });

  it('shows score summary with net in subtitle for in-progress tee times', async () => {
    mockSwrData = [inProgressScore];
    render(<ScoresPage />);

    await screen.findByText('In Progress');
    const subtitle = screen.getByText(/42.*\(net.*\).*thru 9 of 18/);
    expect(subtitle).toBeInTheDocument();
  });

  it('shows "18 holes" in subtitle for not-started tee times', async () => {
    mockSwrData = [notStartedScore];
    render(<ScoresPage />);

    await screen.findByText('Pending');
    expect(screen.getByText(/18 holes/)).toBeInTheDocument();
  });

  it('does not show "In Progress" for not-started tee times', async () => {
    mockSwrData = [notStartedScore];
    render(<ScoresPage />);

    await screen.findByText('Pending');
    expect(screen.queryByText('In Progress')).not.toBeInTheDocument();
  });

  it('does not show "Pending" for in-progress tee times', async () => {
    mockSwrData = [inProgressScore];
    render(<ScoresPage />);

    await screen.findByText('In Progress');
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
  });

  it('shows both pills when list has mixed not-started and in-progress', async () => {
    mockSwrData = [notStartedScore, inProgressScore];
    render(<ScoresPage />);

    expect(await screen.findByText('Pending')).toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });

  it('shows gross score and net score for completed rounds (regression)', async () => {
    mockSearchParams = new URLSearchParams('tab=completed');
    mockSwrData = [completedScore];
    render(<ScoresPage />);

    expect(await screen.findByText('85')).toBeInTheDocument();
    expect(screen.getByText(/Net E/)).toBeInTheDocument();
    expect(screen.queryByText('Pending')).not.toBeInTheDocument();
    expect(screen.queryByText('In Progress')).not.toBeInTheDocument();
  });
});
