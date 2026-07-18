import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { mockSupabaseClient } from '../setup';
import MatchupCard from '@/components/playoffs/MatchupCard';
import { notifySlack } from '@/lib/slack-notify';
import type { PlayoffBracket, PlayoffMatchHole } from '@/types/database';

const mockShowToast = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

const mockLogAuditEvent = vi.fn();
vi.mock('@/lib/audit', () => ({
  logAuditEvent: (...args: unknown[]) => mockLogAuditEvent(...args),
}));

vi.mock('@/lib/slack-notify', () => ({ notifySlack: vi.fn() }));

const mockCheckAndNotifyRoundComplete = vi.fn();
vi.mock('@/lib/playoffs', async () => {
  const actual = await vi.importActual<typeof import('@/lib/playoffs')>('@/lib/playoffs');
  return { ...actual, checkAndNotifyRoundComplete: (...args: unknown[]) => mockCheckAndNotifyRoundComplete(...args) };
});

function makeMatch(overrides: Partial<PlayoffBracket> = {}): PlayoffBracket {
  return {
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
    event_id: null,
    format: null,
    holes: 18,
    status: 'scheduled',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
    player1: { id: 'u1', full_name: 'David Mustard', profile_picture_url: null },
    player2: { id: 'u2', full_name: 'Grady Bunn', profile_picture_url: null },
    ...overrides,
  };
}

describe('MatchupCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseClient.rpc.mockResolvedValue({ data: null, error: null });
    mockCheckAndNotifyRoundComplete.mockResolvedValue(undefined);
  });

  it('renders both player names', () => {
    render(<MatchupCard match={makeMatch()} seedMap={new Map()} />);
    expect(screen.getByText('David Mustard')).toBeInTheDocument();
    expect(screen.getByText('Grady Bunn')).toBeInTheDocument();
  });

  it('shows a seed badge next to a seeded player', () => {
    const seedMap = new Map([['u1', 3]]);
    render(<MatchupCard match={makeMatch()} seedMap={seedMap} />);
    expect(screen.getByText('#3')).toBeInTheDocument();
  });

  it('renders BYE when player2_id is null', () => {
    render(<MatchupCard match={makeMatch({ player2_id: null, player2: null })} seedMap={new Map()} />);
    expect(screen.getByText('BYE')).toBeInTheDocument();
    expect(screen.queryByText('Grady Bunn')).not.toBeInTheDocument();
  });

  it('highlights the winner and dims the loser when winner_id is a real participant', () => {
    render(<MatchupCard match={makeMatch({ winner_id: 'u1' })} seedMap={new Map()} />);
    const winner = screen.getByText('David Mustard');
    const loser = screen.getByText('Grady Bunn');
    expect(winner.className).toContain('text-green-700');
    expect(loser.closest('div')?.className).toContain('opacity-60');
  });

  it('does not dim either slot when winner_id is orphaned (matches neither participant)', () => {
    render(<MatchupCard match={makeMatch({ winner_id: 'some-other-user' })} seedMap={new Map()} />);
    const p1 = screen.getByText('David Mustard');
    const p2 = screen.getByText('Grady Bunn');
    expect(p1.className).not.toContain('text-green-700');
    expect(p2.className).not.toContain('text-green-700');
    expect(p1.closest('div')?.className).not.toContain('opacity-60');
    expect(p2.closest('div')?.className).not.toContain('opacity-60');
  });

  it('shows result text next to each player when present', () => {
    render(<MatchupCard match={makeMatch({ winner_id: 'u1', player1_result: '3 & 2', player2_result: '3 DN' })} seedMap={new Map()} />);
    expect(screen.getByText('3 & 2')).toBeInTheDocument();
    expect(screen.getByText('3 DN')).toBeInTheDocument();
  });

  it('shows TBD when a player is not yet assigned', () => {
    render(<MatchupCard match={makeMatch({ player1_id: null, player1: null })} seedMap={new Map()} />);
    expect(screen.getByText('TBD')).toBeInTheDocument();
  });

  describe('self-service gating', () => {
    it('does not show self-service controls outside the active playoff season', () => {
      render(<MatchupCard match={makeMatch()} seedMap={new Map()} isActiveSeason={false} currentUserId="u1" />);
      expect(screen.queryByText('Choose a format for this matchup')).not.toBeInTheDocument();
    });

    it('does not show self-service controls for a non-participant, non-admin viewer', () => {
      render(<MatchupCard match={makeMatch()} seedMap={new Map()} isActiveSeason currentUserId="someone-else" />);
      expect(screen.queryByText('Choose a format for this matchup')).not.toBeInTheDocument();
    });

    it('shows self-service controls for a participant in the active season', () => {
      render(<MatchupCard match={makeMatch()} seedMap={new Map()} isActiveSeason currentUserId="u1" />);
      expect(screen.getByText('Choose a format for this matchup')).toBeInTheDocument();
    });

    it('shows self-service controls for an admin even if not a participant', () => {
      render(<MatchupCard match={makeMatch()} seedMap={new Map()} isActiveSeason currentUserId="admin-1" isAdmin />);
      expect(screen.getByText('Choose a format for this matchup')).toBeInTheDocument();
    });

    it('hides self-service controls entirely for a BYE matchup', () => {
      render(
        <MatchupCard
          match={makeMatch({ player2_id: null, player2: null })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
        />
      );
      expect(screen.queryByText('Choose a format for this matchup')).not.toBeInTheDocument();
    });
  });

  describe('format picker', () => {
    it('sets match play format via the RPC and calls onRefresh', async () => {
      const onRefresh = vi.fn();
      render(<MatchupCard match={makeMatch()} seedMap={new Map()} isActiveSeason currentUserId="u1" onRefresh={onRefresh} />);

      fireEvent.click(screen.getByText('36'));
      fireEvent.click(screen.getByText('Match Play'));

      await waitFor(() => {
        expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('set_playoff_matchup_format', {
          p_matchup_id: 'b1',
          p_format: 'match_play',
          p_holes: 36,
        });
      });
      expect(mockLogAuditEvent).toHaveBeenCalledWith('set_playoff_format', 'playoff_bracket', 'b1', { format: 'match_play', holes: 36 });
      expect(notifySlack).toHaveBeenCalledWith({
        event_type: 'playoff_format_set',
        flight: 'championship',
        round: 1,
        round_label: null,
        player1_name: 'David Mustard',
        player2_name: 'Grady Bunn',
        format: 'match_play',
        holes: 36,
      });
      expect(onRefresh).toHaveBeenCalled();
    });

    it('defaults to 18 holes and sets stroke play format via the RPC', async () => {
      render(<MatchupCard match={makeMatch()} seedMap={new Map()} isActiveSeason currentUserId="u1" />);
      fireEvent.click(screen.getByText('Stroke Play'));
      await waitFor(() => {
        expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('set_playoff_matchup_format', {
          p_matchup_id: 'b1',
          p_format: 'stroke_play',
          p_holes: 18,
        });
      });
    });

    it('shows an error toast when the format RPC fails', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({ data: null, error: { message: 'not authorized' } });
      render(<MatchupCard match={makeMatch()} seedMap={new Map()} isActiveSeason currentUserId="u1" />);
      fireEvent.click(screen.getByText('Stroke Play'));
      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Failed to set format: not authorized', 'error');
      });
    });
  });

  describe('stroke play placeholder', () => {
    it('shows a read-only note for stroke play matchups instead of controls', () => {
      render(<MatchupCard match={makeMatch({ format: 'stroke_play' })} seedMap={new Map()} isActiveSeason currentUserId="u1" />);
      expect(screen.getByText(/best net will update automatically once scores are posted/)).toBeInTheDocument();
    });

    it('shows the "updates automatically" note once at least one player has a live net', () => {
      render(
        <MatchupCard
          match={makeMatch({ format: 'stroke_play' })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
          bestNet={{ player1: -2, player2: null }}
        />
      );
      expect(screen.getByText(/best net updates automatically from posted scores/)).toBeInTheDocument();
    });

    it('shows the live best net for each player and highlights the leader (lower net)', () => {
      render(
        <MatchupCard
          match={makeMatch({ format: 'stroke_play' })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
          bestNet={{ player1: -2, player2: 3 }}
        />
      );
      const leaderNet = screen.getByText('-2');
      const trailerNet = screen.getByText('+3');
      expect(leaderNet.className).toContain('text-minerva-600');
      expect(trailerNet.className).not.toContain('text-minerva-600');
    });

    it('shows "E" for an even best net', () => {
      render(
        <MatchupCard
          match={makeMatch({ format: 'stroke_play' })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
          bestNet={{ player1: 0, player2: 5 }}
        />
      );
      expect(screen.getByText('E')).toBeInTheDocument();
    });

    it('does not highlight either player as leading when their nets are tied', () => {
      render(
        <MatchupCard
          match={makeMatch({ format: 'stroke_play' })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
          bestNet={{ player1: 1, player2: 1 }}
        />
      );
      const nets = screen.getAllByText('+1');
      expect(nets).toHaveLength(2);
      nets.forEach((el) => expect(el.className).not.toContain('text-minerva-600'));
    });

    it('shows the live net to a spectator viewing the active season (not just participants)', () => {
      render(
        <MatchupCard
          match={makeMatch({ format: 'stroke_play' })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="a-spectator"
          bestNet={{ player1: -1, player2: 2 }}
        />
      );
      expect(screen.getByText('-1')).toBeInTheDocument();
      expect(screen.getByText('+2')).toBeInTheDocument();
    });

    it('shows the live net to a spectator for an undecided-format matchup (defaults to stroke play)', () => {
      render(
        <MatchupCard
          match={makeMatch({ format: null })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="a-spectator"
          bestNet={{ player1: -3, player2: 1 }}
        />
      );
      expect(screen.getByText('-3')).toBeInTheDocument();
    });

    it('does not show the live-net note to a participant while their format choice is still open', () => {
      // A participant with an undecided format sees the FormatPicker
      // asking them to choose Stroke Play or Match Play — showing "Stroke
      // play — best net will update..." underneath at the same time would
      // read as though the choice had already been made for them.
      render(
        <MatchupCard
          match={makeMatch({ format: null })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
          bestNet={{ player1: -3, player2: 1 }}
        />
      );
      expect(screen.getByText('Choose a format for this matchup')).toBeInTheDocument();
      expect(screen.queryByText('-3')).not.toBeInTheDocument();
      expect(screen.queryByText(/best net/)).not.toBeInTheDocument();
    });

    it('does not show a live net outside the active season, even if format is stroke play', () => {
      render(
        <MatchupCard
          match={makeMatch({ format: 'stroke_play' })}
          seedMap={new Map()}
          isActiveSeason={false}
          currentUserId="u1"
          bestNet={{ player1: -3, player2: 1 }}
        />
      );
      expect(screen.queryByText('-3')).not.toBeInTheDocument();
      expect(screen.queryByText(/best net/)).not.toBeInTheDocument();
    });

    it('does not show a live net for a BYE matchup', () => {
      render(
        <MatchupCard
          match={makeMatch({ format: 'stroke_play', player2_id: null, player2: null })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
          bestNet={{ player1: -3, player2: null }}
        />
      );
      expect(screen.queryByText('-3')).not.toBeInTheDocument();
      expect(screen.queryByText(/best net/)).not.toBeInTheDocument();
    });
  });

  describe('stroke play winner confirmation', () => {
    it('shows a Confirm Winner button to a participant once both nets are posted with a clear leader', () => {
      render(
        <MatchupCard
          match={makeMatch({ format: 'stroke_play' })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
          bestNet={{ player1: -2, player2: 3 }}
        />
      );
      expect(screen.getByText('Confirm Winner: David (-2)')).toBeInTheDocument();
    });

    it('shows the Confirm Winner button to an admin who is not a participant', () => {
      render(
        <MatchupCard
          match={makeMatch({ format: 'stroke_play' })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="an-admin"
          isAdmin
          bestNet={{ player1: -2, player2: 3 }}
        />
      );
      expect(screen.getByText('Confirm Winner: David (-2)')).toBeInTheDocument();
    });

    it('hides the Confirm Winner button from a spectator (non-participant, non-admin)', () => {
      render(
        <MatchupCard
          match={makeMatch({ format: 'stroke_play' })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="a-spectator"
          bestNet={{ player1: -2, player2: 3 }}
        />
      );
      expect(screen.queryByText(/Confirm Winner/)).not.toBeInTheDocument();
    });

    it('hides the Confirm Winner button and shows a tie note when nets are tied', () => {
      render(
        <MatchupCard
          match={makeMatch({ format: 'stroke_play' })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
          bestNet={{ player1: 1, player2: 1 }}
        />
      );
      expect(screen.queryByText(/Confirm Winner/)).not.toBeInTheDocument();
      expect(screen.getByText(/scores are tied/)).toBeInTheDocument();
    });

    it('hides the Confirm Winner button once a winner has already been decided', () => {
      render(
        <MatchupCard
          match={makeMatch({ format: 'stroke_play', winner_id: 'u1' })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
          bestNet={{ player1: -2, player2: 3 }}
        />
      );
      expect(screen.queryByText(/Confirm Winner/)).not.toBeInTheDocument();
    });

    it('confirms the winner via the RPC, fires playoff_match_final, checks round completion, and refreshes', async () => {
      const onRefresh = vi.fn();
      render(
        <MatchupCard
          match={makeMatch({ format: 'stroke_play' })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
          bestNet={{ player1: -2, player2: 3 }}
          roundLabel="Quarterfinal"
          onRefresh={onRefresh}
        />
      );

      fireEvent.click(screen.getByText('Confirm Winner: David (-2)'));

      await waitFor(() => {
        expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('confirm_stroke_play_winner', {
          p_matchup_id: 'b1',
          p_winner_id: 'u1',
        });
      });
      expect(mockLogAuditEvent).toHaveBeenCalledWith('confirm_stroke_play_winner', 'playoff_bracket', 'b1', { winner_id: 'u1' });
      expect(notifySlack).toHaveBeenCalledWith({
        event_type: 'playoff_match_final',
        flight: 'championship',
        round: 1,
        round_label: 'Quarterfinal',
        player1_name: 'David Mustard',
        player2_name: 'Grady Bunn',
        winner_name: 'David Mustard',
        status_text: '(net -2 to +3)',
      });
      expect(mockCheckAndNotifyRoundComplete).toHaveBeenCalled();
      expect(onRefresh).toHaveBeenCalled();
    });

    it('shows an error toast and does not refresh when the RPC fails', async () => {
      mockSupabaseClient.rpc.mockResolvedValue({ data: null, error: { message: 'not authorized' } });
      const onRefresh = vi.fn();
      render(
        <MatchupCard
          match={makeMatch({ format: 'stroke_play' })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
          bestNet={{ player1: -2, player2: 3 }}
          onRefresh={onRefresh}
        />
      );

      fireEvent.click(screen.getByText('Confirm Winner: David (-2)'));

      await waitFor(() => {
        expect(mockShowToast).toHaveBeenCalledWith('Failed to confirm winner: not authorized', 'error');
      });
      expect(onRefresh).not.toHaveBeenCalled();
    });
  });

  describe('match play grid', () => {
    function makeHole(hole_number: number, result: 'player1' | 'player2' | 'halve'): PlayoffMatchHole {
      return { id: `h${hole_number}`, matchup_id: 'b1', hole_number, result, updated_by: 'u1', created_at: '', updated_at: '' };
    }

    it('shows the live running status text prefixed with the leader\'s first name', () => {
      const holes = [makeHole(1, 'player1'), makeHole(2, 'player1'), makeHole(3, 'halve')];
      render(
        <MatchupCard
          match={makeMatch({ format: 'match_play', holes: 18 })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
          holes={holes}
        />
      );
      expect(screen.getByText('David 2 UP thru 3')).toBeInTheDocument();
    });

    it('shows the running status text with no leader name when the match is tied', () => {
      const holes = [makeHole(1, 'player1'), makeHole(2, 'player2')];
      render(
        <MatchupCard
          match={makeMatch({ format: 'match_play', holes: 18 })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
          holes={holes}
        />
      );
      expect(screen.getByText('All Square thru 2')).toBeInTheDocument();
    });

    it('shows a read-only "View holes" grid to a spectator (non-participant, non-admin)', () => {
      const holes = [makeHole(1, 'player1')];
      render(
        <MatchupCard
          match={makeMatch({ format: 'match_play', holes: 18 })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="a-spectator"
          holes={holes}
        />
      );
      expect(screen.queryByText('Log holes')).not.toBeInTheDocument();
      fireEvent.click(screen.getByText('View holes'));
      const holeRow = screen.getByText('#1').closest('div')!;
      expect(within(holeRow).getByText('David')).toBeInTheDocument();
      expect(within(holeRow).getByText('Grady')).toBeInTheDocument();
    });

    it('does not let a spectator log a hole result by clicking the read-only grid buttons', async () => {
      render(
        <MatchupCard
          match={makeMatch({ format: 'match_play', holes: 18 })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="a-spectator"
        />
      );
      fireEvent.click(screen.getByText('View holes'));
      const holeRow = screen.getByText('#1').closest('div')!;
      const button = within(holeRow).getByText('David');
      expect(button).toBeDisabled();
      fireEvent.click(button);
      expect(mockSupabaseClient.rpc).not.toHaveBeenCalledWith('upsert_playoff_match_hole', expect.anything());
    });

    it('hides the Mark Match Final button from a spectator even once holes have been played', () => {
      const holes = [makeHole(1, 'player1')];
      render(
        <MatchupCard
          match={makeMatch({ format: 'match_play', holes: 18, status: 'in_progress' })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="a-spectator"
          holes={holes}
        />
      );
      fireEvent.click(screen.getByText('View holes'));
      expect(screen.queryByText('Mark Match Final')).not.toBeInTheDocument();
    });

    it('still shows an editable "Log holes" grid to a participant even when a spectator would only see it read-only', () => {
      render(
        <MatchupCard
          match={makeMatch({ format: 'match_play', holes: 18 })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
        />
      );
      fireEvent.click(screen.getByText('Log holes'));
      const holeRow = screen.getByText('#1').closest('div')!;
      expect(within(holeRow).getByText('David')).not.toBeDisabled();
    });

    it('shows each player\'s first name and "Halved" on the hole grid buttons instead of P1/P2/AS', () => {
      render(
        <MatchupCard
          match={makeMatch({ format: 'match_play', holes: 18 })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
        />
      );
      fireEvent.click(screen.getByText('Log holes'));
      const holeRow = screen.getByText('#1').closest('div')!;
      expect(within(holeRow).getByText('David')).toBeInTheDocument();
      expect(within(holeRow).getByText('Halved')).toBeInTheDocument();
      expect(within(holeRow).getByText('Grady')).toBeInTheDocument();
      expect(within(holeRow).queryByText('P1')).not.toBeInTheDocument();
      expect(within(holeRow).queryByText('P2')).not.toBeInTheDocument();
      expect(within(holeRow).queryByText('AS')).not.toBeInTheDocument();
    });

    it('uses only the first name when a player has a multi-word full name', () => {
      render(
        <MatchupCard
          match={makeMatch({
            format: 'match_play',
            holes: 18,
            player1: { id: 'u1', full_name: 'Mary Jo Watson', profile_picture_url: null },
          })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
        />
      );
      fireEvent.click(screen.getByText('Log holes'));
      const holeRow = screen.getByText('#1').closest('div')!;
      expect(within(holeRow).getByText('Mary')).toBeInTheDocument();
    });

    it('expands to show a hole-by-hole grid sized to the matchup holes', () => {
      render(
        <MatchupCard
          match={makeMatch({ format: 'match_play', holes: 18 })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
        />
      );
      fireEvent.click(screen.getByText('Log holes'));
      expect(screen.getByText('#1')).toBeInTheDocument();
      expect(screen.getByText('#18')).toBeInTheDocument();
      expect(screen.queryByText('#19')).not.toBeInTheDocument();
    });

    it('expands to a 36-hole grid when the matchup is 36 holes', () => {
      render(
        <MatchupCard
          match={makeMatch({ format: 'match_play', holes: 36 })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
        />
      );
      fireEvent.click(screen.getByText('Log holes'));
      expect(screen.getByText('#36')).toBeInTheDocument();
    });

    it('logs a hole result via the RPC with the mirrored status text and calls onRefresh', async () => {
      const onRefresh = vi.fn();
      const holes = [makeHole(1, 'player1'), makeHole(2, 'player1')];
      render(
        <MatchupCard
          match={makeMatch({ format: 'match_play', holes: 18 })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
          holes={holes}
          onRefresh={onRefresh}
        />
      );

      fireEvent.click(screen.getByText('Log holes'));
      const holeRow = screen.getByText('#3').closest('div')!;
      fireEvent.click(within(holeRow).getByText('Halved'));

      await waitFor(() => {
        expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('upsert_playoff_match_hole', {
          p_matchup_id: 'b1',
          p_hole_number: 3,
          p_result: 'halve',
          p_player1_result: '2 UP thru 3',
          p_player2_result: '2 DN thru 3',
        });
      });
      expect(mockLogAuditEvent).toHaveBeenCalledWith('log_playoff_hole', 'playoff_bracket', 'b1', { hole_number: 3, result: 'halve' });
      expect(notifySlack).toHaveBeenCalledWith({
        event_type: 'playoff_status_update',
        flight: 'championship',
        round: 1,
        round_label: null,
        player1_name: 'David Mustard',
        player2_name: 'Grady Bunn',
        status_text: '2 UP thru 3',
        hole_number: 3,
        leader_first_name: 'David',
      });
      expect(onRefresh).toHaveBeenCalled();
    });

    it('fires both playoff_match_start and playoff_status_update when the very first hole is logged', async () => {
      render(
        <MatchupCard
          match={makeMatch({ format: 'match_play', holes: 18 })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
          holes={[]}
          roundLabel="Quarterfinal"
        />
      );

      fireEvent.click(screen.getByText('Log holes'));
      const holeRow = screen.getByText('#1').closest('div')!;
      fireEvent.click(within(holeRow).getByText('David'));

      await waitFor(() => {
        expect(notifySlack).toHaveBeenCalledWith({
          event_type: 'playoff_match_start',
          flight: 'championship',
          round: 1,
          round_label: 'Quarterfinal',
          player1_name: 'David Mustard',
          player2_name: 'Grady Bunn',
          format: 'match_play',
          holes: 18,
        });
      });
      expect(notifySlack).toHaveBeenCalledWith({
        event_type: 'playoff_status_update',
        flight: 'championship',
        round: 1,
        round_label: 'Quarterfinal',
        player1_name: 'David Mustard',
        player2_name: 'Grady Bunn',
        status_text: '1 UP thru 1',
        hole_number: 1,
        leader_first_name: 'David',
      });
    });

    it('shows a Mark Match Final button once holes have been played, and calls the status RPC', async () => {
      const holes = [makeHole(1, 'player1')];
      render(
        <MatchupCard
          match={makeMatch({ format: 'match_play', holes: 18, status: 'in_progress' })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
          holes={holes}
          roundLabel="Quarterfinal"
        />
      );

      fireEvent.click(screen.getByText('Mark Match Final'));
      await waitFor(() => {
        expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('set_playoff_match_status', {
          p_matchup_id: 'b1',
          p_status: 'final',
        });
      });
      expect(mockLogAuditEvent).toHaveBeenCalledWith('set_playoff_match_status', 'playoff_bracket', 'b1', { status: 'final' });
      expect(notifySlack).toHaveBeenCalledWith({
        event_type: 'playoff_match_final',
        flight: 'championship',
        round: 1,
        round_label: 'Quarterfinal',
        player1_name: 'David Mustard',
        player2_name: 'Grady Bunn',
        winner_name: 'David Mustard',
        status_text: '1 UP thru 1',
      });
      expect(mockCheckAndNotifyRoundComplete).toHaveBeenCalledWith(
        mockSupabaseClient,
        expect.objectContaining({ id: 'b1' }),
        'Quarterfinal'
      );
    });

    it('does not fire playoff_match_final when the match is marked final all square (no leader)', async () => {
      const holes = [makeHole(1, 'player1'), makeHole(2, 'player2')];
      render(
        <MatchupCard
          match={makeMatch({ format: 'match_play', holes: 18, status: 'in_progress' })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
          holes={holes}
        />
      );

      fireEvent.click(screen.getByText('Mark Match Final'));
      await waitFor(() => {
        expect(mockSupabaseClient.rpc).toHaveBeenCalledWith('set_playoff_match_status', {
          p_matchup_id: 'b1',
          p_status: 'final',
        });
      });
      expect(notifySlack).not.toHaveBeenCalledWith(expect.objectContaining({ event_type: 'playoff_match_final' }));
      expect(mockCheckAndNotifyRoundComplete).toHaveBeenCalled();
    });

    it('does not show Mark Match Final before any holes are logged', () => {
      render(
        <MatchupCard
          match={makeMatch({ format: 'match_play', holes: 18, status: 'scheduled' })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
          holes={[]}
        />
      );
      expect(screen.queryByText('Mark Match Final')).not.toBeInTheDocument();
    });

    it('does not show Mark Match Final once the matchup is already final', () => {
      const holes = [makeHole(1, 'player1')];
      render(
        <MatchupCard
          match={makeMatch({ format: 'match_play', holes: 18, status: 'final' })}
          seedMap={new Map()}
          isActiveSeason
          currentUserId="u1"
          holes={holes}
        />
      );
      expect(screen.queryByText('Mark Match Final')).not.toBeInTheDocument();
    });
  });
});
