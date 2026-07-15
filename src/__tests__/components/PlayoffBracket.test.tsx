import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { mockSupabaseClient } from '../setup';
import PlayoffBracket from '@/components/playoffs/PlayoffBracket';
import { notifySlack } from '@/lib/slack-notify';

vi.mock('@/lib/slack-notify', () => ({ notifySlack: vi.fn() }));

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

let mockIsPlayoffs = false;
let mockSeasonId = 's1';
vi.mock('@/lib/hooks/useSeason', () => ({
  useSeason: () => ({
    season: { id: mockSeasonId, mode: mockIsPlayoffs ? 'playoffs' : 'off_season' },
    isPlayoffs: mockIsPlayoffs,
  }),
}));

let mockCurrentUserId: string | null = null;
let mockIsAdmin = false;
vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: mockCurrentUserId ? { id: mockCurrentUserId, full_name: 'Viewer' } : null,
    isAdmin: mockIsAdmin,
  }),
}));

const selfServiceBracket = {
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
  format: null,
  holes: 18,
  status: 'scheduled',
  player1: { id: 'u1', full_name: 'Current Player', profile_picture_url: null },
  player2: { id: 'u2', full_name: 'Opponent Player', profile_picture_url: null },
};

describe('PlayoffBracket — self-service wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsPlayoffs = false;
    mockSeasonId = 's1';
    mockCurrentUserId = null;
    mockIsAdmin = false;
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'playoff_brackets') return createChainProxy([selfServiceBracket]);
      if (table === 'playoff_seeds') return createChainProxy([]);
      if (table === 'playoff_match_holes') return createChainProxy([]);
      return createChainProxy([]);
    });
  });

  it('does not show the format picker when the season is not actively in playoffs mode', async () => {
    mockIsPlayoffs = false;
    mockCurrentUserId = 'u1';
    render(<PlayoffBracket seasonId="s1" />);
    await screen.findByText('Current Player');
    expect(screen.queryByText('Choose a format for this matchup')).not.toBeInTheDocument();
  });

  it('does not show the format picker for a historical season even if it was once in playoffs mode', async () => {
    mockIsPlayoffs = true;
    mockSeasonId = 's2'; // the CURRENT playoff season is different from the one being viewed
    mockCurrentUserId = 'u1';
    render(<PlayoffBracket seasonId="s1" />);
    await screen.findByText('Current Player');
    expect(screen.queryByText('Choose a format for this matchup')).not.toBeInTheDocument();
  });

  it('shows the format picker to a participant while the season is actively in playoffs mode', async () => {
    mockIsPlayoffs = true;
    mockSeasonId = 's1';
    mockCurrentUserId = 'u1';
    render(<PlayoffBracket seasonId="s1" />);
    await screen.findByText('Current Player');
    expect(screen.getByText('Choose a format for this matchup')).toBeInTheDocument();
  });

  it('shows the format picker to an admin even when not a participant', async () => {
    mockIsPlayoffs = true;
    mockSeasonId = 's1';
    mockCurrentUserId = 'admin-1';
    mockIsAdmin = true;
    render(<PlayoffBracket seasonId="s1" />);
    await screen.findByText('Current Player');
    expect(screen.getByText('Choose a format for this matchup')).toBeInTheDocument();
  });

  it('does not show the format picker to a spectator who is not a participant or admin', async () => {
    mockIsPlayoffs = true;
    mockSeasonId = 's1';
    mockCurrentUserId = 'spectator';
    render(<PlayoffBracket seasonId="s1" />);
    await screen.findByText('Current Player');
    expect(screen.queryByText('Choose a format for this matchup')).not.toBeInTheDocument();
  });

  it('renders the match play grid with live running status once a matchup has a match play format', async () => {
    mockIsPlayoffs = true;
    mockSeasonId = 's1';
    mockCurrentUserId = 'u1';
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'playoff_brackets') return createChainProxy([{ ...selfServiceBracket, format: 'match_play' }]);
      if (table === 'playoff_seeds') return createChainProxy([]);
      if (table === 'playoff_match_holes') return createChainProxy([
        { id: 'h1', matchup_id: 'b1', hole_number: 1, result: 'player1', updated_by: 'u1', created_at: '', updated_at: '' },
        { id: 'h2', matchup_id: 'b1', hole_number: 2, result: 'halve', updated_by: 'u1', created_at: '', updated_at: '' },
      ]);
      return createChainProxy([]);
    });

    render(<PlayoffBracket seasonId="s1" />);
    await screen.findByText('Current Player');
    await waitFor(() => {
      expect(screen.getByText('Current 1 UP thru 2')).toBeInTheDocument();
    });
  });

  it('resolves the live best net from posted scores in the matchup round event, for the active season', async () => {
    mockIsPlayoffs = true;
    mockSeasonId = 's1';
    mockCurrentUserId = 'spectator'; // best-net is visible even to non-participants
    const playoffEvents = [
      { id: 'e1', season_id: 's1', event_number: 1, name: null, start_date: '2026-03-01', end_date: '2026-03-01', holes: 18, is_major: false, is_playoff: true, created_at: '', updated_at: '' },
    ];
    const scores = [
      { user_id: 'u1', event_id: 'e1', is_complete: true, net_strokes_over_par: -2 },
      { user_id: 'u1', event_id: 'e1', is_complete: true, net_strokes_over_par: 1 },
      { user_id: 'u2', event_id: 'e1', is_complete: true, net_strokes_over_par: 4 },
    ];
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'playoff_brackets') return createChainProxy([{ ...selfServiceBracket, round: 1, format: 'stroke_play' }]);
      if (table === 'playoff_seeds') return createChainProxy([]);
      if (table === 'playoff_match_holes') return createChainProxy([]);
      if (table === 'events') return createChainProxy(playoffEvents);
      if (table === 'scores') return createChainProxy(scores);
      return createChainProxy([]);
    });

    render(<PlayoffBracket seasonId="s1" />);
    await screen.findByText('Current Player');
    expect(await screen.findByText('-2')).toBeInTheDocument();
    expect(screen.getByText('+4')).toBeInTheDocument();
  });

  it('does not query scores/events (and shows no live net) for a season that is not actively in playoffs mode', async () => {
    mockIsPlayoffs = false;
    mockCurrentUserId = 'u1';
    const fromSpy = vi.fn((table: string) => {
      if (table === 'playoff_brackets') return createChainProxy([{ ...selfServiceBracket, format: 'stroke_play' }]);
      if (table === 'playoff_seeds') return createChainProxy([]);
      if (table === 'playoff_match_holes') return createChainProxy([]);
      return createChainProxy([]);
    });
    mockSupabaseClient.from.mockImplementation(fromSpy);

    render(<PlayoffBracket seasonId="s1" />);
    await screen.findByText('Current Player');
    expect(screen.queryByText(/best net/)).not.toBeInTheDocument();
    expect(fromSpy).not.toHaveBeenCalledWith('events');
    expect(fromSpy).not.toHaveBeenCalledWith('scores');
  });

  it('threads the computed round label through to Slack notifications fired by MatchupCard', async () => {
    mockIsPlayoffs = true;
    mockSeasonId = 's1';
    mockCurrentUserId = 'u1';
    mockSupabaseClient.rpc.mockResolvedValue({ data: null, error: null });
    // Only one round exists for this flight, so PlayoffBracket's round-label
    // computation (anchored on seed count, which is empty here) falls back
    // to treating it as the Final.
    render(<PlayoffBracket seasonId="s1" />);
    await screen.findByText('Current Player');

    fireEvent.click(screen.getByText('Stroke Play'));

    await waitFor(() => {
      expect(notifySlack).toHaveBeenCalledWith(expect.objectContaining({
        event_type: 'playoff_format_set',
        round_label: 'Final',
      }));
    });
  });

  it('shows the read-only stroke play note instead of a hole grid for stroke play matchups', async () => {
    mockIsPlayoffs = true;
    mockSeasonId = 's1';
    mockCurrentUserId = 'u1';
    mockSupabaseClient.from.mockImplementation((table: string) => {
      if (table === 'playoff_brackets') return createChainProxy([{ ...selfServiceBracket, format: 'stroke_play' }]);
      if (table === 'playoff_seeds') return createChainProxy([]);
      if (table === 'playoff_match_holes') return createChainProxy([]);
      return createChainProxy([]);
    });

    render(<PlayoffBracket seasonId="s1" />);
    await screen.findByText('Current Player');
    expect(await screen.findByText(/best net will update automatically/)).toBeInTheDocument();
    expect(screen.queryByText('Log holes')).not.toBeInTheDocument();
  });
});
