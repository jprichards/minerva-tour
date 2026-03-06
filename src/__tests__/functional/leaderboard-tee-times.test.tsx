import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

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

vi.mock('@/lib/hooks/useSeason', () => ({
  useSeason: () => ({ isOffSeason: false }),
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

// Player A: has one completed score only (should appear with that score)
const playerA_completedScore = {
  id: 'score-1',
  user_id: 'user-a',
  event_id: 'evt-1',
  gross_score: 86,
  net_score: 79,
  net_strokes_over_par: 7,
  holes_played: 18,
  is_complete: true,
  course_handicap: 7,
  handicap_index_used: 6.0,
  course: { id: 'c-1', course_name: 'Horseshoe Bend CC', tee_name: 'Blue', type: '18_holes', par: 72, rating: 72.0, slope: 130 },
  user: { full_name: 'Devin Blankenship', email: 'devin@test.com', profile_picture_url: null, handicap_index: 6.0 },
  event: mockEvent,
};

// Player B: has ONLY bare tee times, no scores (should NOT appear)
const playerB_teeTime1 = {
  id: 'score-2',
  user_id: 'user-b',
  event_id: 'evt-1',
  gross_score: null,
  net_score: null,
  net_strokes_over_par: null,
  holes_played: null,
  is_complete: false,
  course_handicap: null,
  handicap_index_used: null,
  course: { id: 'c-2', course_name: 'Cobblestone', tee_name: 'White', type: '18_holes', par: 72, rating: 70.0, slope: 125 },
  user: { full_name: 'Robby Dewling', email: 'robby@test.com', profile_picture_url: null, handicap_index: 15.0 },
  event: mockEvent,
};

const playerB_teeTime2 = {
  id: 'score-3',
  user_id: 'user-b',
  event_id: 'evt-1',
  gross_score: null,
  net_score: null,
  net_strokes_over_par: null,
  holes_played: null,
  is_complete: false,
  course_handicap: null,
  handicap_index_used: null,
  course: { id: 'c-3', course_name: 'Bobby Jones GC', tee_name: 'Azalea', type: '18_holes', par: 72, rating: 69.0, slope: 120 },
  user: { full_name: 'Robby Dewling', email: 'robby@test.com', profile_picture_url: null, handicap_index: 15.0 },
  event: mockEvent,
};

// Player C: has a completed score AND a bare tee time (should appear with the score, tee time ignored)
const playerC_completedScore = {
  id: 'score-4',
  user_id: 'user-c',
  event_id: 'evt-1',
  gross_score: 90,
  net_score: 76,
  net_strokes_over_par: 4,
  holes_played: 18,
  is_complete: true,
  course_handicap: 14,
  handicap_index_used: 14.0,
  course: { id: 'c-4', course_name: 'Pebble Beach', tee_name: 'White', type: '18_holes', par: 72, rating: 71.0, slope: 125 },
  user: { full_name: 'Charlie Palmer', email: 'charlie@test.com', profile_picture_url: null, handicap_index: 14.0 },
  event: mockEvent,
};

const playerC_teeTime = {
  id: 'score-5',
  user_id: 'user-c',
  event_id: 'evt-1',
  gross_score: null,
  net_score: null,
  net_strokes_over_par: null,
  holes_played: null,
  is_complete: false,
  course_handicap: null,
  handicap_index_used: null,
  course: { id: 'c-5', course_name: 'TPC Sawgrass', tee_name: 'Gold', type: '18_holes', par: 72, rating: 73.0, slope: 140 },
  user: { full_name: 'Charlie Palmer', email: 'charlie@test.com', profile_picture_url: null, handicap_index: 14.0 },
  event: mockEvent,
};

// Player D: has TWO completed scores AND a tee time (should show BEST score only)
const playerD_bestScore = {
  id: 'score-6',
  user_id: 'user-d',
  event_id: 'evt-1',
  gross_score: 80,
  net_score: 70,
  net_strokes_over_par: -2,
  holes_played: 18,
  is_complete: true,
  course_handicap: 10,
  handicap_index_used: 10.0,
  course: { id: 'c-6', course_name: 'Augusta National', tee_name: 'Gold', type: '18_holes', par: 72, rating: 74.0, slope: 137 },
  user: { full_name: 'Dana Smith', email: 'dana@test.com', profile_picture_url: null, handicap_index: 10.0 },
  event: mockEvent,
};

const playerD_worseScore = {
  id: 'score-7',
  user_id: 'user-d',
  event_id: 'evt-1',
  gross_score: 95,
  net_score: 85,
  net_strokes_over_par: 13,
  holes_played: 18,
  is_complete: true,
  course_handicap: 10,
  handicap_index_used: 10.0,
  course: { id: 'c-7', course_name: 'Torrey Pines', tee_name: 'Blue', type: '18_holes', par: 72, rating: 75.0, slope: 142 },
  user: { full_name: 'Dana Smith', email: 'dana@test.com', profile_picture_url: null, handicap_index: 10.0 },
  event: mockEvent,
};

const playerD_teeTime = {
  id: 'score-8',
  user_id: 'user-d',
  event_id: 'evt-1',
  gross_score: null,
  net_score: null,
  net_strokes_over_par: null,
  holes_played: null,
  is_complete: false,
  course_handicap: null,
  handicap_index_used: null,
  course: { id: 'c-8', course_name: 'Pinehurst No. 2', tee_name: 'White', type: '18_holes', par: 72, rating: 72.0, slope: 131 },
  user: { full_name: 'Dana Smith', email: 'dana@test.com', profile_picture_url: null, handicap_index: 10.0 },
  event: mockEvent,
};

const allScores = [
  playerA_completedScore,
  playerB_teeTime1, playerB_teeTime2,
  playerC_completedScore, playerC_teeTime,
  playerD_bestScore, playerD_worseScore, playerD_teeTime,
];

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

describe('Leaderboard - tee times vs scored rounds', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows players who have completed scores', async () => {
    render(<LeaderboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Devin Blankenship')).toBeInTheDocument();
      expect(screen.getByText('Charlie Palmer')).toBeInTheDocument();
      expect(screen.getByText('Dana Smith')).toBeInTheDocument();
    });
  });

  it('does NOT show a player who only has bare tee times (no scores posted)', async () => {
    render(<LeaderboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Devin Blankenship')).toBeInTheDocument();
    });
    expect(screen.queryByText('Robby Dewling')).not.toBeInTheDocument();
  });

  it('does not leak tee-time-only courses onto the leaderboard', async () => {
    render(<LeaderboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Devin Blankenship')).toBeInTheDocument();
    });
    expect(screen.queryByText(/Cobblestone/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Bobby Jones/)).not.toBeInTheDocument();
  });

  it('shows score data (not tee time data) for a player with both a score and a tee time', async () => {
    render(<LeaderboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Charlie Palmer')).toBeInTheDocument();
    });
    const card = screen.getByText('Charlie Palmer').closest('div[class*="rounded-xl"]')!;
    expect(card.textContent).toContain('Pebble Beach');
    expect(card.textContent).not.toContain('TPC Sawgrass');
  });

  it('shows the BEST score when a player has multiple scores plus a tee time', async () => {
    render(<LeaderboardPage />);
    await waitFor(() => {
      expect(screen.getByText('Dana Smith')).toBeInTheDocument();
    });
    const card = screen.getByText('Dana Smith').closest('div[class*="rounded-xl"]')!;
    // Best score is Net -2 from Augusta, not Net +13 from Torrey Pines
    expect(card.textContent).toContain('Augusta National');
    expect(card.textContent).toContain('-2');
    expect(card.textContent).not.toContain('Torrey Pines');
    expect(card.textContent).not.toContain('Pinehurst');
  });
});
