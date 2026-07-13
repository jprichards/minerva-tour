import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { mockSupabaseClient } from '../setup';

import PlayoffsPage from '@/app/(protected)/playoffs/page';

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
];

const mockSeeds = [
  { id: 'seed1', season_id: 's1', user_id: 'u1', seed_number: 1 },
  { id: 'seed2', season_id: 's1', user_id: 'u2', seed_number: 6 },
];

const mockBrackets = [
  {
    id: 'b1',
    season_id: 's1',
    flight: 'championship',
    round: 1,
    matchup_number: 1,
    player1_id: 'u1',
    player2_id: 'u2',
    winner_id: 'u1',
    player1_result: '-2',
    player2_result: '+4',
    player1: { id: 'u1', full_name: 'Tiger Woods', profile_picture_url: null },
    player2: { id: 'u2', full_name: 'Jack Nicklaus', profile_picture_url: null },
  },
  {
    id: 'b2',
    season_id: 's1',
    flight: 'championship',
    round: 1,
    matchup_number: 2,
    player1_id: 'u3',
    player2_id: null,
    winner_id: 'u3',
    player1_result: null,
    player2_result: null,
    player1: { id: 'u3', full_name: 'Arnold Palmer', profile_picture_url: null },
    player2: null,
  },
  {
    id: 'b3',
    season_id: 's1',
    flight: 'consolation',
    round: 1,
    matchup_number: 1,
    player1_id: 'u4',
    player2_id: 'u5',
    winner_id: null,
    player1_result: null,
    player2_result: null,
    player1: { id: 'u4', full_name: 'Phil Mickelson', profile_picture_url: null },
    player2: { id: 'u5', full_name: 'Rory McIlroy', profile_picture_url: null },
  },
  {
    id: 'b4',
    season_id: 's1',
    flight: 'unicorn',
    round: 1,
    matchup_number: 1,
    player1_id: 'u6',
    player2_id: 'u7',
    winner_id: null,
    player1_result: null,
    player2_result: null,
    player1: { id: 'u6', full_name: 'Dustin Johnson', profile_picture_url: null },
    player2: { id: 'u7', full_name: 'Jordan Spieth', profile_picture_url: null },
  },
];

describe('Playoffs Member View', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'seasons') return createChainProxy(mockSeasons);
      if (table === 'playoff_brackets') return createChainProxy(mockBrackets);
      if (table === 'playoff_seeds') return createChainProxy(mockSeeds);
      return createChainProxy([]);
    });
  });

  it('renders the page header and season selector', async () => {
    render(<PlayoffsPage />);
    expect(await screen.findByText('Playoffs')).toBeInTheDocument();
    expect(screen.getByText('2025')).toBeInTheDocument();
  });

  it('renders flight tabs', async () => {
    render(<PlayoffsPage />);
    await screen.findByText('Tiger Woods');
    expect(screen.getByText(/Championship/)).toBeInTheDocument();
    expect(screen.getByText(/Consolation/)).toBeInTheDocument();
    expect(screen.getByText(/Unicorn/)).toBeInTheDocument();
  });

  it('renders bracket matchups with player names', async () => {
    render(<PlayoffsPage />);
    expect(await screen.findByText('Tiger Woods')).toBeInTheDocument();
    expect(screen.getByText('Jack Nicklaus')).toBeInTheDocument();
  });

  it('shows seed badges next to seeded players', async () => {
    render(<PlayoffsPage />);
    await screen.findByText('Tiger Woods');
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#6')).toBeInTheDocument();
  });

  it('displays match results', async () => {
    render(<PlayoffsPage />);
    await screen.findByText('Tiger Woods');
    expect(screen.getByText('-2')).toBeInTheDocument();
    expect(screen.getByText('+4')).toBeInTheDocument();
  });

  it('shows BYE for matchups with one player', async () => {
    render(<PlayoffsPage />);
    await screen.findByText('Arnold Palmer');
    expect(screen.getByText('BYE')).toBeInTheDocument();
  });

  it('highlights winner with green styling', async () => {
    render(<PlayoffsPage />);
    const tiger = await screen.findByText('Tiger Woods');
    expect(tiger.className).toContain('font-bold');
    expect(tiger.className).toContain('text-green-700');
  });

  it('shows Loser Advances banner when Unicorn tab is selected', async () => {
    render(<PlayoffsPage />);
    await screen.findByText('Tiger Woods');

    // Banner should not be visible for Championship (default tab)
    expect(screen.queryByText(/Reverse bracket/)).not.toBeInTheDocument();

    // Click Unicorn tab
    fireEvent.click(screen.getByText(/Unicorn/));

    await waitFor(() => {
      expect(screen.getByText(/Reverse bracket/)).toBeInTheDocument();
      expect(screen.getByText(/loser/)).toBeInTheDocument();
    });
  });

  it('does not show Loser Advances banner for Championship or Consolation', async () => {
    render(<PlayoffsPage />);
    await screen.findByText('Tiger Woods');

    // Default is Championship
    expect(screen.queryByText(/Reverse bracket/)).not.toBeInTheDocument();

    // Switch to Consolation
    fireEvent.click(screen.getByText(/Consolation/));
    await waitFor(() => {
      expect(screen.queryByText(/Reverse bracket/)).not.toBeInTheDocument();
    });
  });
});

describe('Playoffs Member View — bug fixes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not dim either slot when winner_id is orphaned (matches neither participant)', async () => {
    const orphanedBrackets = [
      {
        id: 'b1',
        season_id: 's1',
        flight: 'championship',
        round: 1,
        matchup_number: 2,
        player1_id: 'u1',
        player2_id: 'u2',
        // Orphaned: neither participant — simulates a stale winner from a re-seed.
        winner_id: 'u99',
        player1_result: null,
        player2_result: null,
        player1: { id: 'u1', full_name: 'David Mustard', profile_picture_url: null },
        player2: { id: 'u2', full_name: 'Grady Bunn', profile_picture_url: null },
      },
    ];

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'seasons') return createChainProxy(mockSeasons);
      if (table === 'playoff_brackets') return createChainProxy(orphanedBrackets);
      if (table === 'playoff_seeds') return createChainProxy([]);
      return createChainProxy([]);
    });

    render(<PlayoffsPage />);
    const p1 = await screen.findByText('David Mustard');
    const p2 = await screen.findByText('Grady Bunn');

    // Neither slot should be marked as winner (bold/green) or loser (dimmed).
    expect(p1.className).not.toContain('text-green-700');
    expect(p2.className).not.toContain('text-green-700');
    expect(p1.closest('div')?.className).not.toContain('opacity-60');
    expect(p2.closest('div')?.className).not.toContain('opacity-60');
  });

  it('dims only the actual loser when winner_id matches a real participant', async () => {
    const validBrackets = [
      {
        id: 'b1',
        season_id: 's1',
        flight: 'championship',
        round: 1,
        matchup_number: 1,
        player1_id: 'u1',
        player2_id: 'u2',
        winner_id: 'u1',
        player1_result: null,
        player2_result: null,
        player1: { id: 'u1', full_name: 'David Mustard', profile_picture_url: null },
        player2: { id: 'u2', full_name: 'Grady Bunn', profile_picture_url: null },
      },
    ];

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'seasons') return createChainProxy(mockSeasons);
      if (table === 'playoff_brackets') return createChainProxy(validBrackets);
      if (table === 'playoff_seeds') return createChainProxy([]);
      return createChainProxy([]);
    });

    render(<PlayoffsPage />);
    const winner = await screen.findByText('David Mustard');
    const loser = await screen.findByText('Grady Bunn');

    expect(winner.className).toContain('text-green-700');
    expect(loser.closest('div')?.className).toContain('opacity-60');
  });

  it('labels round 1 as Quarterfinal (not Final) when the flight has 6 seeds', async () => {
    const sixSeeds = Array.from({ length: 6 }, (_, i) => ({
      id: `seed${i + 1}`,
      season_id: 's1',
      user_id: `u${i + 1}`,
      seed_number: i + 1,
    }));
    const round1Only = [
      {
        id: 'b1',
        season_id: 's1',
        flight: 'championship',
        round: 1,
        matchup_number: 1,
        player1_id: 'u1',
        player2_id: 'u2',
        winner_id: null,
        player1_result: null,
        player2_result: null,
        player1: { id: 'u1', full_name: 'Player One', profile_picture_url: null },
        player2: { id: 'u2', full_name: 'Player Two', profile_picture_url: null },
      },
    ];

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'seasons') return createChainProxy(mockSeasons);
      if (table === 'playoff_brackets') return createChainProxy(round1Only);
      if (table === 'playoff_seeds') return createChainProxy(sixSeeds);
      return createChainProxy([]);
    });

    render(<PlayoffsPage />);
    await screen.findByText('Player One');
    expect(screen.getByText('Quarterfinal')).toBeInTheDocument();
    expect(screen.queryByText('Final')).not.toBeInTheDocument();
  });

  it('hides the flight filter row entirely when only one flight has bracket data', async () => {
    const championshipOnly = [
      {
        id: 'b1',
        season_id: 's1',
        flight: 'championship',
        round: 1,
        matchup_number: 1,
        player1_id: 'u1',
        player2_id: 'u2',
        winner_id: null,
        player1_result: null,
        player2_result: null,
        player1: { id: 'u1', full_name: 'Solo Flight One', profile_picture_url: null },
        player2: { id: 'u2', full_name: 'Solo Flight Two', profile_picture_url: null },
      },
    ];

    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'seasons') return createChainProxy(mockSeasons);
      if (table === 'playoff_brackets') return createChainProxy(championshipOnly);
      if (table === 'playoff_seeds') return createChainProxy([]);
      return createChainProxy([]);
    });

    render(<PlayoffsPage />);
    await screen.findByText('Solo Flight One');
    expect(screen.queryByText('Championship')).not.toBeInTheDocument();
    expect(screen.queryByText('Consolation')).not.toBeInTheDocument();
    expect(screen.queryByText('Unicorn')).not.toBeInTheDocument();
  });

  it('still shows the flight filter row when multiple flights have bracket data', async () => {
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'seasons') return createChainProxy(mockSeasons);
      if (table === 'playoff_brackets') return createChainProxy(mockBrackets);
      if (table === 'playoff_seeds') return createChainProxy(mockSeeds);
      return createChainProxy([]);
    });

    render(<PlayoffsPage />);
    await screen.findByText('Tiger Woods');
    expect(screen.getByText(/Championship/)).toBeInTheDocument();
    expect(screen.getByText(/Consolation/)).toBeInTheDocument();
    expect(screen.getByText(/Unicorn/)).toBeInTheDocument();
  });
});
