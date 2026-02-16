import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    await screen.findByText('Playoffs');
    expect(screen.getByText('Championship')).toBeInTheDocument();
    expect(screen.getByText('Consolation')).toBeInTheDocument();
    expect(screen.getByText('Unicorn')).toBeInTheDocument();
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
});
