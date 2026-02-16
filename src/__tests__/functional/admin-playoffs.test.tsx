import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { mockSupabaseClient } from '../setup';

// Mock useUser
const mockIsAdmin = vi.fn().mockReturnValue(true);
vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    isAdmin: mockIsAdmin(),
    loading: false,
    profile: { id: 'admin-1', role: 'admin' },
  }),
}));

// Mock Toast
const mockShowToast = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

// Mock audit
vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

import AdminPlayoffsPage from '@/app/(protected)/admin/playoffs/page';

function createChainProxy(resolvedData: unknown = []) {
  const proxy: Record<string, unknown> = {};
  const handler = () => proxy;
  ['select', 'insert', 'update', 'delete', 'eq', 'neq', 'in', 'is', 'not',
    'gte', 'lte', 'order', 'limit', 'single'].forEach((m) => {
    proxy[m] = vi.fn(handler);
  });
  proxy.then = vi.fn((resolve: (val: unknown) => void) => {
    resolve({ data: resolvedData, error: null });
    return Promise.resolve({ data: resolvedData, error: null });
  });
  return proxy;
}

const mockSeasons = [
  { id: 's1', year: 2025, mode: 'off_season', current_event_id: null },
  { id: 's2', year: 2026, mode: 'regular_season', current_event_id: null },
];

const mockMembers = [
  { id: 'u1', full_name: 'Tiger Woods', email: 'tiger@test.com', role: 'member' },
  { id: 'u2', full_name: 'Jack Nicklaus', email: 'jack@test.com', role: 'member' },
  { id: 'u3', full_name: 'Arnold Palmer', email: 'arnold@test.com', role: 'member' },
  { id: 'u4', full_name: 'Ben Hogan', email: 'ben@test.com', role: 'admin' },
];

const mockSeeds = [
  { id: 'seed1', season_id: 's2', user_id: 'u1', seed_number: 1, user: { id: 'u1', full_name: 'Tiger Woods' } },
  { id: 'seed2', season_id: 's2', user_id: 'u2', seed_number: 2, user: { id: 'u2', full_name: 'Jack Nicklaus' } },
  { id: 'seed3', season_id: 's2', user_id: 'u3', seed_number: 3, user: { id: 'u3', full_name: 'Arnold Palmer' } },
];

const mockBrackets = [
  {
    id: 'b1',
    season_id: 's2',
    flight: 'championship',
    round: 1,
    matchup_number: 1,
    player1_id: 'u3',
    player2_id: 'u4',
    winner_id: 'u3',
    player1_result: '-1',
    player2_result: '+3',
    event_id: null,
    player1: { id: 'u3', full_name: 'Arnold Palmer' },
    player2: { id: 'u4', full_name: 'Ben Hogan' },
    winner: { id: 'u3', full_name: 'Arnold Palmer' },
  },
  {
    id: 'b2',
    season_id: 's2',
    flight: 'championship',
    round: 2,
    matchup_number: 1,
    player1_id: 'u1',
    player2_id: null,
    winner_id: 'u1',
    player1_result: null,
    player2_result: null,
    event_id: null,
    player1: { id: 'u1', full_name: 'Tiger Woods' },
    player2: null,
    winner: { id: 'u1', full_name: 'Tiger Woods' },
  },
];

describe('Admin Playoffs Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsAdmin.mockReturnValue(true);

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'seasons') return createChainProxy(mockSeasons);
      if (table === 'users') return createChainProxy(mockMembers);
      if (table === 'playoff_brackets') return createChainProxy(mockBrackets);
      if (table === 'playoff_seeds') return createChainProxy(mockSeeds);
      return createChainProxy([]);
    });
  });

  it('renders the page header and season selector', async () => {
    render(<AdminPlayoffsPage />);
    expect(await screen.findByText('Playoff Brackets')).toBeInTheDocument();
    expect(screen.getByText('2025')).toBeInTheDocument();
    expect(screen.getByText('2026')).toBeInTheDocument();
  });

  it('renders flight tabs', async () => {
    render(<AdminPlayoffsPage />);
    await screen.findByText('Playoff Brackets');
    expect(screen.getByText('Championship')).toBeInTheDocument();
    expect(screen.getByText('Consolation')).toBeInTheDocument();
    expect(screen.getByText('Unicorn')).toBeInTheDocument();
  });

  it('renders bracket matchups with player names', async () => {
    render(<AdminPlayoffsPage />);
    expect(await screen.findByText('Arnold Palmer')).toBeInTheDocument();
    expect(screen.getByText('Ben Hogan')).toBeInTheDocument();
  });

  it('shows BYE for matchups with one player', async () => {
    render(<AdminPlayoffsPage />);
    await screen.findByText('Tiger Woods');
    const byeElements = screen.getAllByText('BYE');
    expect(byeElements.length).toBeGreaterThanOrEqual(1);
  });

  it('displays match results next to player names', async () => {
    render(<AdminPlayoffsPage />);
    await screen.findByText('Arnold Palmer');
    expect(screen.getByText('-1')).toBeInTheDocument();
    expect(screen.getByText('+3')).toBeInTheDocument();
  });

  it('shows seed badges for seeded players', async () => {
    render(<AdminPlayoffsPage />);
    await screen.findByText('Arnold Palmer');
    const seedBadges = screen.getAllByText('#3');
    expect(seedBadges.length).toBeGreaterThanOrEqual(1);
    const seed1Badges = screen.getAllByText('#1');
    expect(seed1Badges.length).toBeGreaterThanOrEqual(1);
  });

  it('renders Manage Seeds toggle button', async () => {
    render(<AdminPlayoffsPage />);
    await screen.findByText('Playoff Brackets');
    expect(screen.getByText(/Manage Seeds/)).toBeInTheDocument();
  });

  it('opens seed panel when Manage Seeds is clicked', async () => {
    render(<AdminPlayoffsPage />);
    await screen.findByText('Playoff Brackets');

    fireEvent.click(screen.getByText(/Manage Seeds/));

    await waitFor(() => {
      expect(screen.getByText(/Seeds 1-6 = Championship/)).toBeInTheDocument();
      expect(screen.getByText('Save Seeds')).toBeInTheDocument();
      expect(screen.getByText('Add Seed')).toBeInTheDocument();
    });
  });

  it('renders pencil edit icon on each matchup', async () => {
    render(<AdminPlayoffsPage />);
    await screen.findByText('Arnold Palmer');
    const editButtons = screen.getAllByTitle('Edit matchup');
    expect(editButtons.length).toBe(2);
  });

  it('opens inline edit form with result fields when pencil icon is clicked', async () => {
    render(<AdminPlayoffsPage />);
    await screen.findByText('Arnold Palmer');

    const editButtons = screen.getAllByTitle('Edit matchup');
    fireEvent.click(editButtons[0]);

    await waitFor(() => {
      expect(screen.getByText(/Editing Matchup #1/)).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g. -1, 1UP, DNP')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g. +3, 1DN, DNP')).toBeInTheDocument();
    });
  });

  it('cancels edit and returns to display mode', async () => {
    render(<AdminPlayoffsPage />);
    await screen.findByText('Arnold Palmer');

    const editButtons = screen.getAllByTitle('Edit matchup');
    fireEvent.click(editButtons[0]);

    await waitFor(() => expect(screen.getByText(/Editing Matchup/)).toBeInTheDocument());

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText(/Editing Matchup/)).not.toBeInTheDocument();
    });
  });

  it('shows Add Matchup button and opens form with result fields', async () => {
    render(<AdminPlayoffsPage />);
    await screen.findByText('Arnold Palmer');

    fireEvent.click(screen.getByText('Add Matchup'));

    await waitFor(() => {
      expect(screen.getByText('New Matchup')).toBeInTheDocument();
      expect(screen.getByText(/P1 Result/)).toBeInTheDocument();
      expect(screen.getByText(/P2 Result/)).toBeInTheDocument();
    });
  });

  it('redirects non-admin users', () => {
    mockIsAdmin.mockReturnValue(false);
    render(<AdminPlayoffsPage />);
    expect(screen.getByText('Admin access required.')).toBeInTheDocument();
    expect(screen.queryByText('Playoff Brackets')).not.toBeInTheDocument();
  });

  it('shows round dropdown with labeled options in add matchup form', async () => {
    render(<AdminPlayoffsPage />);
    await screen.findByText('Arnold Palmer');

    fireEvent.click(screen.getByText('Add Matchup'));

    await waitFor(() => {
      expect(screen.getByText('Round 1')).toBeInTheDocument();
      expect(screen.getByText('Round 2 (Semifinal)')).toBeInTheDocument();
      expect(screen.getByText('Round 3 (Final)')).toBeInTheDocument();
    });
  });

  it('hides matchup selector when Round 3 (Final) is selected', async () => {
    render(<AdminPlayoffsPage />);
    await screen.findByText('Arnold Palmer');

    fireEvent.click(screen.getByText('Add Matchup'));

    await waitFor(() => expect(screen.getByText('New Matchup')).toBeInTheDocument());

    const roundSelect = screen.getByDisplayValue('Round 1');
    fireEvent.change(roundSelect, { target: { value: '3' } });

    await waitFor(() => {
      expect(screen.queryByText(/Matchup \d/)).not.toBeInTheDocument();
    });
  });

  it('shows BYE badge only for seeds 1-2 and 7-8 in seed panel', async () => {
    // Mock seeds with entries across all flights
    const seedsWithAll = [
      { id: 's1', season_id: 's2', user_id: 'u1', seed_number: 1, user: { id: 'u1', full_name: 'Tiger Woods' } },
      { id: 's2', season_id: 's2', user_id: 'u2', seed_number: 2, user: { id: 'u2', full_name: 'Jack Nicklaus' } },
      { id: 's3', season_id: 's2', user_id: 'u3', seed_number: 7, user: { id: 'u3', full_name: 'Arnold Palmer' } },
      { id: 's4', season_id: 's2', user_id: 'u4', seed_number: 8, user: { id: 'u4', full_name: 'Ben Hogan' } },
    ];

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'seasons') return createChainProxy(mockSeasons);
      if (table === 'users') return createChainProxy(mockMembers);
      if (table === 'playoff_brackets') return createChainProxy([]);
      if (table === 'playoff_seeds') return createChainProxy(seedsWithAll);
      return createChainProxy([]);
    });

    render(<AdminPlayoffsPage />);
    await screen.findByText('Playoff Brackets');

    fireEvent.click(screen.getByText(/Manage Seeds/));

    await waitFor(() => {
      const byeBadges = screen.getAllByText('BYE');
      // Seeds 1, 2, 7, 8 all get BYE badges (Championship + Consolation)
      expect(byeBadges.length).toBe(4);
    });
  });

  it('shows BYE badge for the last 2 Unicorn seeds (reverse bracket)', async () => {
    const unicornSeeds = [
      { id: 's1', season_id: 's2', user_id: 'u1', seed_number: 13, user: { id: 'u1', full_name: 'Tiger Woods' } },
      { id: 's2', season_id: 's2', user_id: 'u2', seed_number: 14, user: { id: 'u2', full_name: 'Jack Nicklaus' } },
    ];

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'seasons') return createChainProxy(mockSeasons);
      if (table === 'users') return createChainProxy(mockMembers);
      if (table === 'playoff_brackets') return createChainProxy([]);
      if (table === 'playoff_seeds') return createChainProxy(unicornSeeds);
      return createChainProxy([]);
    });

    render(<AdminPlayoffsPage />);
    await screen.findByText('Playoff Brackets');

    fireEvent.click(screen.getByText(/Manage Seeds/));

    await waitFor(() => {
      // Seeds 13-14 are the last 2 Unicorn seeds, so both get BYE
      const byeBadges = screen.getAllByText('BYE');
      expect(byeBadges.length).toBe(2);
    });
  });

  it('only gives BYE to last 2 Unicorn seeds, not middle ones', async () => {
    const unicornSeeds = [
      { id: 's1', season_id: 's2', user_id: 'u1', seed_number: 13, user: { id: 'u1', full_name: 'Tiger Woods' } },
      { id: 's2', season_id: 's2', user_id: 'u2', seed_number: 14, user: { id: 'u2', full_name: 'Jack Nicklaus' } },
      { id: 's3', season_id: 's2', user_id: 'u3', seed_number: 15, user: { id: 'u3', full_name: 'Arnold Palmer' } },
      { id: 's4', season_id: 's2', user_id: 'u4', seed_number: 16, user: { id: 'u4', full_name: 'Ben Hogan' } },
    ];

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'seasons') return createChainProxy(mockSeasons);
      if (table === 'users') return createChainProxy(mockMembers);
      if (table === 'playoff_brackets') return createChainProxy([]);
      if (table === 'playoff_seeds') return createChainProxy(unicornSeeds);
      return createChainProxy([]);
    });

    render(<AdminPlayoffsPage />);
    await screen.findByText('Playoff Brackets');

    fireEvent.click(screen.getByText(/Manage Seeds/));

    await waitFor(() => {
      // Only seeds 15-16 (last 2) get BYE, not 13-14
      const byeBadges = screen.getAllByText('BYE');
      expect(byeBadges.length).toBe(2);
    });
  });

  it('displays matchups in correct order (matchup 1 before matchup 2)', async () => {
    const orderedBrackets = [
      {
        id: 'b1', season_id: 's2', flight: 'championship', round: 1, matchup_number: 1,
        player1_id: 'u1', player2_id: 'u2', winner_id: null, player1_result: null, player2_result: null,
        event_id: null, player1: { id: 'u1', full_name: 'Tiger Woods' }, player2: { id: 'u2', full_name: 'Jack Nicklaus' }, winner: null,
      },
      {
        id: 'b2', season_id: 's2', flight: 'championship', round: 1, matchup_number: 2,
        player1_id: 'u3', player2_id: 'u4', winner_id: null, player1_result: null, player2_result: null,
        event_id: null, player1: { id: 'u3', full_name: 'Arnold Palmer' }, player2: { id: 'u4', full_name: 'Ben Hogan' }, winner: null,
      },
    ];

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'seasons') return createChainProxy(mockSeasons);
      if (table === 'users') return createChainProxy(mockMembers);
      if (table === 'playoff_brackets') return createChainProxy(orderedBrackets);
      if (table === 'playoff_seeds') return createChainProxy([]);
      return createChainProxy([]);
    });

    render(<AdminPlayoffsPage />);
    const tiger = await screen.findByText('Tiger Woods');
    const arnold = screen.getByText('Arnold Palmer');

    // Tiger (matchup 1) should appear before Arnold (matchup 2) in the DOM
    expect(tiger.compareDocumentPosition(arnold) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
