import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/leaderboard',
}));

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: { id: 'user-1', full_name: 'Test User' },
    authUser: { id: 'user-1' },
    loading: false,
    isAdmin: false,
  }),
}));

let mockIsOffSeason = false;
vi.mock('@/lib/hooks/useSeason', () => ({
  useSeason: () => ({ isOffSeason: mockIsOffSeason }),
}));

vi.mock('@/lib/export', () => ({
  downloadCSV: vi.fn(),
  downloadPDF: vi.fn(),
  generateLeaderboardHTML: vi.fn(),
}));

const mockEvent = {
  id: 'evt-1',
  name: 'Event 1',
  event_number: 1,
  start_date: '2026-03-01',
  end_date: '2026-03-15',
  holes: 18,
  is_major: false,
  is_playoff: false,
};

const mockSeason = {
  id: 's-1',
  year: 2026,
  mode: 'regular_season',
  current_event_id: 'evt-1',
};

const completedScore = {
  id: 'score-1',
  user_id: 'user-a',
  event_id: 'evt-1',
  gross_score: 82,
  net_score: 70,
  net_strokes_over_par: -2,
  holes_played: 18,
  is_complete: true,
  course_handicap: 12,
  course: { id: 'c-1', course_name: 'Pine Valley', tee_name: 'Blue', type: '18_holes', par: 72, rating: 72.0, slope: 130 },
  user: { full_name: 'Ashby Foltz', email: 'ashby@test.com', profile_picture_url: null },
  event: mockEvent,
};

const inProgressScore = {
  id: 'score-2',
  user_id: 'user-b',
  event_id: 'evt-1',
  gross_score: 45,
  net_score: 38,
  net_strokes_over_par: 2,
  holes_played: 9,
  is_complete: false,
  course_handicap: 7,
  course: { id: 'c-2', course_name: 'Augusta National', tee_name: 'Gold', type: '18_holes', par: 72, rating: 74.0, slope: 137 },
  user: { full_name: 'Robby Dewling', email: 'robby@test.com', profile_picture_url: null },
  event: mockEvent,
};

const secondRoundScore = {
  id: 'score-3',
  user_id: 'user-a',
  event_id: 'evt-1',
  gross_score: 90,
  net_score: 78,
  net_strokes_over_par: 6,
  holes_played: 18,
  is_complete: true,
  course_handicap: 12,
  course: { id: 'c-3', course_name: 'Pebble Beach', tee_name: 'White', type: '18_holes', par: 72, rating: 71.0, slope: 125 },
  user: { full_name: 'Ashby Foltz', email: 'ashby@test.com', profile_picture_url: null },
  event: mockEvent,
};

const allScores = [completedScore, inProgressScore, secondRoundScore];

vi.mock('swr', () => {
  const actual = { useSWRConfig: () => ({ mutate: vi.fn() }) };
  return {
    ...actual,
    useSWRConfig: actual.useSWRConfig,
    default: (key: string) => {
      if (key === 'leaderboard') {
        return {
          data: {
            currentSeason: mockSeason,
            currentEvent: mockEvent,
            eventScores: allScores,
            allSeasonScores: allScores,
            seasonEvents: [mockEvent],
          },
          isLoading: false,
          error: null,
          mutate: vi.fn(),
        };
      }
      return { data: undefined, isLoading: false, error: null, mutate: vi.fn() };
    },
  };
});

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    channel: () => ({ on: () => ({ subscribe: () => {} }), subscribe: () => {} }),
    removeChannel: vi.fn(),
  }),
}));

import LeaderboardPage from '@/app/(protected)/leaderboard/page';

describe('Leaderboard Page', () => {
  beforeEach(() => {
    mockIsOffSeason = false;
    vi.clearAllMocks();
  });

  it('shows off-season message when season is off', () => {
    mockIsOffSeason = true;
    render(<LeaderboardPage />);
    expect(screen.getByText('Off Season')).toBeInTheDocument();
  });

  it('shows "Thru F" for completed rounds', async () => {
    render(<LeaderboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Ashby Foltz')).toBeInTheDocument();
    });
    const ashbyCard = screen.getByText('Ashby Foltz').closest('div[class*="rounded-xl"]')!;
    expect(ashbyCard.textContent).toContain('Thru F');
  });

  it('shows "Thru 9" for in-progress rounds', async () => {
    render(<LeaderboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Robby Dewling')).toBeInTheDocument();
    });
    const robbyCard = screen.getByText('Robby Dewling').closest('div[class*="rounded-xl"]')!;
    expect(robbyCard.textContent).toContain('Thru 9');
  });

  it('does not display chirps', async () => {
    render(<LeaderboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Ashby Foltz')).toBeInTheDocument();
    });
    const container = screen.getByText('Ashby Foltz').closest('div[class*="space-y"]')!;
    expect(container.querySelector('.text-amber-600')).toBeNull();
  });

  it('shows course name and tee name', async () => {
    render(<LeaderboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Ashby Foltz')).toBeInTheDocument();
    });
    const ashbyCard = screen.getByText('Ashby Foltz').closest('div[class*="rounded-xl"]')!;
    expect(ashbyCard.textContent).toContain('Pine Valley');
    expect(ashbyCard.textContent).toContain('Blue');
  });

  it('shows gross and net score in the info line', async () => {
    render(<LeaderboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Ashby Foltz')).toBeInTheDocument();
    });
    const ashbyCard = screen.getByText('Ashby Foltz').closest('div[class*="rounded-xl"]')!;
    expect(ashbyCard.textContent).toContain('82');
    expect(ashbyCard.textContent).toContain('-2');
  });

  it('assigns projected points to in-progress rounds', async () => {
    render(<LeaderboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Robby Dewling')).toBeInTheDocument();
    });
    const robbyCard = screen.getByText('Robby Dewling').closest('div[class*="rounded-xl"]')!;
    expect(robbyCard.textContent).toContain('pts');
  });

  it('uses best score when player has multiple rounds', async () => {
    render(<LeaderboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Ashby Foltz')).toBeInTheDocument();
    });
    const ashbyCard = screen.getByText('Ashby Foltz').closest('div[class*="rounded-xl"]')!;
    // Best score is Net -2 from Pine Valley, not Net +6 from Pebble Beach
    expect(ashbyCard.textContent).toContain('-2');
    expect(ashbyCard.textContent).toContain('Pine Valley');
    expect(ashbyCard.textContent).not.toContain('Pebble Beach');
  });

  it('renders season standings view', async () => {
    render(<LeaderboardPage />);
    const seasonBtn = screen.getByText('Season Standings');
    fireEvent.click(seasonBtn);
    await waitFor(() => {
      expect(screen.getByText(/2026 Season/)).toBeInTheDocument();
    });
  });
});
