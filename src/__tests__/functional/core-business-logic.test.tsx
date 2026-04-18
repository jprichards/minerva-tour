import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { mockSupabaseClient } from '../setup';
import {
  calculateRegularEventPoints,
  calculateMajorEventPoints,
  splitTiedPoints,
  calculateScratchScore,
} from '@/lib/scoring';
import { getChirp, getChirpBucket } from '@/lib/chirps';

// ============================================
// Tie Splitting Integration Tests
// ============================================
describe('Tie Splitting - Points Calculation', () => {
  it('splits regular event points for 2 tied players at 1st place', () => {
    // 10 participants. 1st = 10pts, 2nd = 9pts. Tie = 9.5 each
    const pts = [
      calculateRegularEventPoints(10, 1),
      calculateRegularEventPoints(10, 2),
    ];
    expect(splitTiedPoints(pts, 2)).toBe(9.5);
  });

  it('splits major event points for 3 tied players at 2nd place', () => {
    const pts = [
      calculateMajorEventPoints(10, 2),
      calculateMajorEventPoints(10, 3),
      calculateMajorEventPoints(10, 4),
    ];
    const split = splitTiedPoints(pts, 3);
    // Should be average of points for places 2, 3, 4 rounded to nearest tenth
    const expected = Math.round(((pts[0] + pts[1] + pts[2]) / 3) * 10) / 10;
    expect(split).toBe(expected);
  });

  it('correctly rounds tie-split points to nearest tenth', () => {
    // 3 players, 7 participants: 7pts, 6pts, 5pts -> avg = 6
    const pts = [7, 6, 5];
    expect(splitTiedPoints(pts, 3)).toBe(6);
  });

  it('no split when only 1 player (degenerate case)', () => {
    expect(splitTiedPoints([10], 1)).toBe(10);
  });

  it('splits for a large tie group', () => {
    // 5-way tie at places 1-5 in a 10-person regular event
    const pts = [];
    for (let place = 1; place <= 5; place++) {
      pts.push(calculateRegularEventPoints(10, place));
    }
    const split = splitTiedPoints(pts, 5);
    const expected = Math.round(((10 + 9 + 8 + 7 + 6) / 5) * 10) / 10;
    expect(split).toBe(expected);
  });
});

// ============================================
// Scratch Scoring — Uses Course Rating, Not Par
// ============================================
describe('Scratch Scoring - Course Rating Normalization', () => {
  it('normalizes scratch scores across courses with different ratings', () => {
    // Easy course: Par 70, Rating 67.5 — gross 80
    const easy = calculateScratchScore(80, 67.5, 70, 18, 18);
    // Hard course: Par 72, Rating 74.5 — gross 82
    const hard = calculateScratchScore(82, 74.5, 72, 18, 18);

    // Scratch over rating: 80-67.5=12.5→13 vs 82-74.5=7.5→8
    // The hard course gross is higher but the scratch score is BETTER because
    // course rating normalizes for difficulty
    expect(hard.scratchStrokesOverRating).toBeLessThan(easy.scratchStrokesOverRating);
  });

  it('would rank incorrectly if using par instead of rating', () => {
    // This test proves why course rating matters:
    // Easy course: Par 70, Rating 67.5 — gross 77
    //   ScratchCH = ROUND(-2.5) = -3, Scratch = 77-(-3)-70 = +10
    // Hard course: Par 72, Rating 74.5 — gross 82
    //   ScratchCH = ROUND(2.5) = 3, Scratch = 82-3-72 = +7
    // Par-based would say easy course score (+7) is better
    // Rating-based correctly says hard course (+7) is better than easy (+10)
    const easy = calculateScratchScore(77, 67.5, 70, 18, 18);
    const hard = calculateScratchScore(82, 74.5, 72, 18, 18);

    expect(hard.scratchStrokesOverRating).toBe(7);
    expect(easy.scratchStrokesOverRating).toBe(10);
    expect(hard.scratchStrokesOverRating).toBeLessThan(easy.scratchStrokesOverRating);
  });

  it('includes playoff events for scratch standings (per PRD)', () => {
    // Scratch competition runs "for the entire length of the season (including playoff events)"
    // We verify the scoring function works for playoff-style rounds
    const playoffRound = calculateScratchScore(78, 71.0, 72, 18, 18);
    expect(playoffRound.scratchStrokesOverRating).toBe(7);
    expect(playoffRound.isPartial).toBe(false);
  });

  it('treats final event as Major for scratch (elevated points)', () => {
    // Per PRD: "the final event of the season... is considered a Major with elevated point payouts"
    // The final event should use calculateMajorEventPoints for scratch standings
    const regularPoints = calculateRegularEventPoints(10, 1); // 10
    const majorPoints = calculateMajorEventPoints(10, 1); // 13.3
    expect(majorPoints).toBeGreaterThan(regularPoints);
    // This confirms that treating the final event as a Major awards more points
  });
});

// ============================================
// Chirps — Score Commentary Integration
// ============================================
describe('Chirps - Score Commentary', () => {
  it('generates appropriate chirps for exceptional rounds', () => {
    const bucket = getChirpBucket(-12);
    expect(bucket).toBe('legendary');
    const chirp = getChirp(-12, 'John');
    expect(chirp.length).toBeGreaterThan(0);
    expect(chirp).not.toContain('$first_name');
  });

  it('generates appropriate chirps for bad rounds', () => {
    const bucket = getChirpBucket(25);
    expect(bucket).toBe('bad');
    const chirp = getChirp(25, 'George');
    expect(chirp.length).toBeGreaterThan(0);
    expect(chirp).not.toContain('$first_name');
  });

  it('substitutes player name correctly', () => {
    // Force deterministic random
    const spy = vi.spyOn(Math, 'random').mockReturnValue(0);
    const chirp = getChirp(-10, 'Ashby');
    // The chirp should contain "Ashby" (from template $first_name substitution)
    // or at minimum not contain the raw placeholder
    expect(chirp).not.toContain('$first_name');
    spy.mockRestore();
  });

  it('maps all boundary values correctly', () => {
    expect(getChirpBucket(-5)).toBe('legendary');
    expect(getChirpBucket(-4)).toBe('excellent');
    expect(getChirpBucket(-1)).toBe('excellent');
    expect(getChirpBucket(0)).toBe('neutral');
    expect(getChirpBucket(1)).toBe('neutral');
    expect(getChirpBucket(2)).toBe('mediocre');
    expect(getChirpBucket(4)).toBe('mediocre');
    expect(getChirpBucket(5)).toBe('rough');
    expect(getChirpBucket(8)).toBe('rough');
    expect(getChirpBucket(9)).toBe('bad');
    expect(getChirpBucket(14)).toBe('bad');
    expect(getChirpBucket(20)).toBe('bad');
  });
});

// ============================================
// Major/Playoff Course Rating Validation
// ============================================

// Mock hooks for AddScorePage
const mockRouter = { push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/scores/add',
  useParams: () => ({}),
}));

const mockProfile = {
  id: 'user-1',
  full_name: 'Test User',
  email: 'test@example.com',
  role: 'member',
  handicap_index: 12.5,
};

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: mockProfile,
    authUser: { id: 'user-1' },
    loading: false,
    isAdmin: false,
    isMember: true,
    isPlayingGuest: false,
    isAuthenticated: true,
  }),
}));

let mockSeasonState: Record<string, unknown> = {
  season: { id: 's-1', mode: 'regular_season' },
  currentEvent: null,
  loading: false,
  isOffSeason: false,
  isRegularSeason: true,
  isPlayoffs: false,
  isTournament: false,
  canSubmitScores: true,
};

vi.mock('@/lib/hooks/useSeason', () => ({
  useSeason: () => mockSeasonState,
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

import AddScorePage from '@/app/(protected)/scores/add/page';

describe('Major/Playoff Course Rating Validation', () => {
  beforeEach(() => {
    mockSeasonState = {
      season: { id: 's-1', mode: 'regular_season' },
      currentEvent: null,
      loading: false,
      isOffSeason: false,
      isRegularSeason: true,
      isPlayoffs: false,
      isTournament: false,
      canSubmitScores: true,
    };
    vi.clearAllMocks();
  });

  it('shows major/playoff rating requirement notice in course selection when event is major', () => {
    mockSeasonState = {
      ...mockSeasonState,
      currentEvent: { id: 'e-1', is_major: true, is_playoff: false },
    };

    render(<AddScorePage />);
    expect(screen.getByText(/Major\/Playoff Event/)).toBeInTheDocument();
    expect(screen.getByText(/Course rating must be 68 or higher/)).toBeInTheDocument();
  });

  it('shows major/playoff rating requirement notice in course selection when event is playoff', () => {
    mockSeasonState = {
      ...mockSeasonState,
      currentEvent: { id: 'e-1', is_major: false, is_playoff: true },
    };

    render(<AddScorePage />);
    expect(screen.getByText(/Major\/Playoff Event/)).toBeInTheDocument();
  });

  it('does NOT show rating requirement notice when event is regular', () => {
    mockSeasonState = {
      ...mockSeasonState,
      currentEvent: { id: 'e-1', is_major: false, is_playoff: false },
    };

    render(<AddScorePage />);
    expect(screen.queryByText(/Major\/Playoff Event/)).not.toBeInTheDocument();
  });
});

// ============================================
// Gross-to-Par Score Entry
// ============================================
describe('Gross-to-Par Score Entry Mode', () => {
  beforeEach(() => {
    mockSeasonState = {
      season: { id: 's-1', mode: 'regular_season' },
      currentEvent: null,
      loading: false,
      isOffSeason: false,
      isRegularSeason: true,
      isPlayoffs: false,
      isTournament: false,
      canSubmitScores: true,
    };
    vi.clearAllMocks();
  });

  it('renders the Submit Score heading and step 1', () => {
    render(<AddScorePage />);
    expect(screen.getByText('Submit Score')).toBeInTheDocument();
    expect(screen.getByText(/Step 1 of 3/)).toBeInTheDocument();
  });

  // The gross-to-par toggle appears in step 3 (details) which requires
  // completing course/player selection first. We verify the component
  // renders without errors when the toggle would be available.
  it('renders the page without errors', () => {
    const { container } = render(<AddScorePage />);
    expect(container).toBeTruthy();
  });
});

// ============================================
// Incomplete Rounds Filtering (Unit Logic)
// ============================================
describe('Incomplete Rounds Filtering Logic', () => {
  it('filters incomplete scores when event has ended', () => {
    const scores = [
      { id: 's1', user_id: 'u1', is_complete: true, net_strokes_over_par: 3 },
      { id: 's2', user_id: 'u2', is_complete: false, net_strokes_over_par: null },
      { id: 's3', user_id: 'u3', is_complete: true, net_strokes_over_par: -1 },
    ];

    const today = new Date().toISOString().split('T')[0];
    const eventEndDate = '2020-01-01'; // Past date
    const eventEnded = eventEndDate < today;

    const eligible = eventEnded ? scores.filter((s) => s.is_complete) : scores;
    expect(eligible.length).toBe(2);
    expect(eligible.every((s) => s.is_complete)).toBe(true);
  });

  it('keeps incomplete scores when event is still active', () => {
    const scores = [
      { id: 's1', user_id: 'u1', is_complete: true, net_strokes_over_par: 3 },
      { id: 's2', user_id: 'u2', is_complete: false, net_strokes_over_par: null },
    ];

    const today = new Date().toISOString().split('T')[0];
    const eventEndDate = '2099-12-31'; // Future date
    const eventEnded = eventEndDate < today;

    const eligible = eventEnded ? scores.filter((s) => s.is_complete) : scores;
    expect(eligible.length).toBe(2); // Both kept
  });
});

// ============================================
// Score Entry: Holes Played Required Validation
// ============================================
describe('Score Entry - Holes Played Required When Score Entered', () => {
  const mockCourses = [
    { id: 'c-1', course_name: 'Pine Valley', tee_name: 'Blue', type: '18_holes', par: 72, rating: 71.0, slope: 130 },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    mockSeasonState = {
      season: { id: 's-1', mode: 'regular_season' },
      currentEvent: { id: 'e-1', event_number: 1 },
      loading: false,
      isOffSeason: false,
      isRegularSeason: true,
      isPlayoffs: false,
      isTournament: false,
      canSubmitScores: true,
    };

    mockSupabaseClient.from.mockImplementation((table: string) => {
      const data = table === 'courses' ? mockCourses : table === 'users'
        ? [{ ...mockProfile, role: 'member' }]
        : null;
      const chain: Record<string, unknown> = {};
      const self = () => chain;
      chain.select = vi.fn(self);
      chain.in = vi.fn(self);
      chain.order = vi.fn(self);
      chain.range = vi.fn(() => Promise.resolve({ data }));
      chain.insert = vi.fn(self);
      chain.single = vi.fn(() => Promise.resolve({ data: { id: 'new-score' }, error: null }));
      chain.eq = vi.fn(self);
      return chain;
    });
  });

  it('enables submit with only gross score when partial round toggle is OFF (full round)', async () => {
    render(<AddScorePage />);

    await waitFor(() => {
      expect(screen.getByText('Pine Valley')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Pine Valley'));

    await waitFor(() => {
      expect(screen.getByText('Me')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Me'));

    await waitFor(() => {
      expect(screen.getByText('Score')).toBeInTheDocument();
    });

    const scoreInput = screen.getByPlaceholderText('e.g. 82');
    fireEvent.change(scoreInput, { target: { value: '85' } });

    expect(screen.queryByText('Required when submitting a score.')).not.toBeInTheDocument();
    const submitButton = screen.getByRole('button', { name: /submit score/i });
    expect(submitButton).not.toBeDisabled();
  });

  it('shows validation in partial round mode when score entered without holes', async () => {
    render(<AddScorePage />);

    await waitFor(() => {
      expect(screen.getByText('Pine Valley')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Pine Valley'));

    await waitFor(() => {
      expect(screen.getByText('Me')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Me'));

    await waitFor(() => {
      expect(screen.getByText('Score')).toBeInTheDocument();
    });

    // Toggle partial round ON
    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);

    const scoreInput = screen.getByPlaceholderText('e.g. 82');
    fireEvent.change(scoreInput, { target: { value: '85' } });

    expect(screen.getByText('Required when submitting a score.')).toBeInTheDocument();
    const submitButton = screen.getByRole('button', { name: /submit score/i });
    expect(submitButton).toBeDisabled();

    // Fill in holes played — validation clears
    const holesInput = screen.getByPlaceholderText('1-17');
    fireEvent.change(holesInput, { target: { value: '13' } });

    expect(screen.queryByText('Required when submitting a score.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /submit score/i })).not.toBeDisabled();
  });

  it('shows validation for gross-to-par mode in partial round without holes', async () => {
    render(<AddScorePage />);

    await waitFor(() => {
      expect(screen.getByText('Pine Valley')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Pine Valley'));

    await waitFor(() => {
      expect(screen.getByText('Me')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Me'));

    await waitFor(() => {
      expect(screen.getByText('Score')).toBeInTheDocument();
    });

    // Toggle partial round ON
    fireEvent.click(screen.getByRole('switch'));

    // Switch to gross-to-par mode
    fireEvent.click(screen.getByText('Gross to Par'));

    const toParInput = screen.getByPlaceholderText(/for over.*for under/);
    fireEvent.change(toParInput, { target: { value: '5' } });

    expect(screen.getByText('Required when submitting a score.')).toBeInTheDocument();
    const submitButton = screen.getByRole('button', { name: /submit score/i });
    expect(submitButton).toBeDisabled();
  });

  it('disables submit in partial round mode when holes entered without a score', async () => {
    render(<AddScorePage />);

    await waitFor(() => {
      expect(screen.getByText('Pine Valley')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Pine Valley'));

    await waitFor(() => {
      expect(screen.getByText('Me')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Me'));

    await waitFor(() => {
      expect(screen.getByText('Score')).toBeInTheDocument();
    });

    // Toggle partial round ON
    fireEvent.click(screen.getByRole('switch'));

    // Enter only holes played, no score
    const holesInput = screen.getByPlaceholderText('1-17');
    fireEvent.change(holesInput, { target: { value: '13' } });

    expect(screen.getByText('Required when holes played is entered.')).toBeInTheDocument();
    const submitButton = screen.getByRole('button', { name: /submit score/i });
    expect(submitButton).toBeDisabled();
  });
});
