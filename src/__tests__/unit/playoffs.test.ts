import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeMatchStatus,
  perPlayerLabel,
  mirrorResultLabels,
  setPlayoffMatchupFormat,
  upsertPlayoffMatchHole,
  setPlayoffMatchStatus,
  confirmStrokePlayWinner,
  resolveEventIdForMatchup,
  resolveBestNet,
  isRoundComplete,
  checkAndNotifyRoundComplete,
  isSeedSelectionMatch,
  computeRoundLabel,
  type HoleEntry,
} from '@/lib/playoffs';
import { notifySlack } from '@/lib/slack-notify';
import type { Event, PlayoffBracket, Score } from '@/types/database';

vi.mock('@/lib/slack-notify', () => ({ notifySlack: vi.fn() }));

function holes(results: Array<'player1' | 'player2' | 'halve'>): HoleEntry[] {
  return results.map((result, i) => ({ hole_number: i + 1, result }));
}

describe('computeMatchStatus', () => {
  it('returns "Not started" with no leader when no holes are played', () => {
    const status = computeMatchStatus([], 18);
    expect(status.statusText).toBe('Not started');
    expect(status.leader).toBeNull();
    expect(status.played).toBe(0);
  });

  it('computes "4 UP thru 7" for p1,p1,halve,p1,p2,p1,p1', () => {
    const status = computeMatchStatus(holes(['player1', 'player1', 'halve', 'player1', 'player2', 'player1', 'player1']), 18);
    expect(status.player1Wins).toBe(5);
    expect(status.player2Wins).toBe(1);
    expect(status.played).toBe(7);
    expect(status.lead).toBe(4);
    expect(status.leader).toBe('player1');
    expect(status.decided).toBe(false);
    expect(status.statusText).toBe('4 UP thru 7');
  });

  it('closes out "3 & 2" when up by 3 with 2 holes remaining (played=16)', () => {
    // p1 wins holes 1-3, then holes are halved through 16 played, lead stays 3.
    const results: Array<'player1' | 'player2' | 'halve'> = ['player1', 'player1', 'player1', ...Array(13).fill('halve') as 'halve'[]];
    const status = computeMatchStatus(holes(results), 18);
    expect(status.played).toBe(16);
    expect(status.lead).toBe(3);
    expect(status.remaining).toBe(2);
    expect(status.decided).toBe(true);
    expect(status.statusText).toBe('3 & 2');
  });

  it('is dormie (not decided) when up by 2 with exactly 2 holes remaining (played=16)', () => {
    const results: Array<'player1' | 'player2' | 'halve'> = ['player1', 'player1', ...Array(14).fill('halve') as 'halve'[]];
    const status = computeMatchStatus(holes(results), 18);
    expect(status.played).toBe(16);
    expect(status.lead).toBe(2);
    expect(status.remaining).toBe(2);
    expect(status.decided).toBe(false);
    expect(status.dormie).toBe(true);
    expect(status.statusText).toBe('2 UP thru 16');
  });

  it('shows "1 UP" when the match is won on the final hole (played=18)', () => {
    const results: Array<'player1' | 'player2' | 'halve'> = [...Array(17).fill('halve') as 'halve'[], 'player1'];
    const status = computeMatchStatus(holes(results), 18);
    expect(status.played).toBe(18);
    expect(status.lead).toBe(1);
    expect(status.statusText).toBe('1 UP');
  });

  it('shows "All Square (halved)" when tied after all 18 holes', () => {
    const results: Array<'player1' | 'player2' | 'halve'> = [
      ...Array(9).fill('player1') as 'player1'[],
      ...Array(9).fill('player2') as 'player2'[],
    ];
    const status = computeMatchStatus(holes(results), 18);
    expect(status.played).toBe(18);
    expect(status.lead).toBe(0);
    expect(status.statusText).toBe('All Square (halved)');
  });

  it('shows "All Square thru 7" when tied with holes remaining', () => {
    const results: Array<'player1' | 'player2' | 'halve'> = [
      'player1', 'player2', 'player1', 'player2', 'player1', 'player2', 'halve',
    ];
    const status = computeMatchStatus(holes(results), 18);
    expect(status.played).toBe(7);
    expect(status.lead).toBe(0);
    expect(status.statusText).toBe('All Square thru 7');
  });

  it('handles 36-hole matches: dormie at 5 up thru 31, then closes "6 & 4" after winning hole 32', () => {
    const results31: Array<'player1' | 'player2' | 'halve'> = [
      ...Array(5).fill('player1') as 'player1'[],
      ...Array(26).fill('halve') as 'halve'[],
    ];
    const status31 = computeMatchStatus(holes(results31), 36);
    expect(status31.played).toBe(31);
    expect(status31.lead).toBe(5);
    expect(status31.remaining).toBe(5);
    expect(status31.dormie).toBe(true);
    expect(status31.decided).toBe(false);
    expect(status31.statusText).toBe('5 UP thru 31');

    const results32 = [...results31, 'player1' as const];
    const status32 = computeMatchStatus(holes(results32), 36);
    expect(status32.played).toBe(32);
    expect(status32.lead).toBe(6);
    expect(status32.remaining).toBe(4);
    expect(status32.decided).toBe(true);
    expect(status32.statusText).toBe('6 & 4');
  });
});

describe('perPlayerLabel / mirrorResultLabels', () => {
  it('returns null for both players when the match has not started', () => {
    const status = computeMatchStatus([], 18);
    expect(perPlayerLabel(status, 'player1')).toBeNull();
    expect(perPlayerLabel(status, 'player2')).toBeNull();
    expect(mirrorResultLabels(status)).toEqual({ player1_result: null, player2_result: null });
  });

  it('shows "AS" for both players when tied', () => {
    const status = computeMatchStatus(holes(['player1', 'player2']), 18);
    expect(perPlayerLabel(status, 'player1')).toBe('AS');
    expect(perPlayerLabel(status, 'player2')).toBe('AS');
  });

  it('gives the leader the full status text and the trailer a DN mirror', () => {
    const status = computeMatchStatus(holes(['player1', 'player1', 'halve', 'player1', 'player2', 'player1', 'player1']), 18);
    expect(perPlayerLabel(status, 'player1')).toBe('4 UP thru 7');
    expect(perPlayerLabel(status, 'player2')).toBe('4 DN thru 7');
    expect(mirrorResultLabels(status)).toEqual({ player1_result: '4 UP thru 7', player2_result: '4 DN thru 7' });
  });

  it('shows the closeout text only on the winner\'s side, not both (no UP/DN split for a definitive result)', () => {
    const results: Array<'player1' | 'player2' | 'halve'> = ['player1', 'player1', 'player1', ...Array(13).fill('halve') as 'halve'[]];
    const status = computeMatchStatus(holes(results), 18);
    expect(perPlayerLabel(status, 'player1')).toBe('3 & 2');
    expect(perPlayerLabel(status, 'player2')).toBeNull();
    expect(mirrorResultLabels(status)).toEqual({ player1_result: '3 & 2', player2_result: null });
  });

  it('gives the trailer "1 DN" when the leader wins 1 UP on the last hole', () => {
    const results: Array<'player1' | 'player2' | 'halve'> = [...Array(17).fill('halve') as 'halve'[], 'player2'];
    const status = computeMatchStatus(holes(results), 18);
    expect(perPlayerLabel(status, 'player2')).toBe('1 UP');
    expect(perPlayerLabel(status, 'player1')).toBe('1 DN');
  });
});

describe('RPC wrappers', () => {
  const mockRpc = vi.fn();
  const supabase = { rpc: mockRpc } as unknown as Parameters<typeof setPlayoffMatchupFormat>[0];

  beforeEach(() => {
    mockRpc.mockReset();
    mockRpc.mockResolvedValue({ data: null, error: null });
  });

  it('setPlayoffMatchupFormat calls the RPC with matchup id, format, and holes', async () => {
    const result = await setPlayoffMatchupFormat(supabase, 'm1', 'match_play', 36);
    expect(mockRpc).toHaveBeenCalledWith('set_playoff_matchup_format', {
      p_matchup_id: 'm1',
      p_format: 'match_play',
      p_holes: 36,
    });
    expect(result.error).toBeNull();
  });

  it('setPlayoffMatchupFormat surfaces an RPC error message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'not authorized' } });
    const result = await setPlayoffMatchupFormat(supabase, 'm1', 'stroke_play', 18);
    expect(result.error).toBe('not authorized');
  });

  it('upsertPlayoffMatchHole computes status from the existing + new hole and mirrors it into the RPC call', async () => {
    const existing: HoleEntry[] = holes(['player1', 'player1']);
    const result = await upsertPlayoffMatchHole(supabase, 'm1', 3, 'halve', existing, 18);

    expect(mockRpc).toHaveBeenCalledWith('upsert_playoff_match_hole', {
      p_matchup_id: 'm1',
      p_hole_number: 3,
      p_result: 'halve',
      p_player1_result: '2 UP thru 3',
      p_player2_result: '2 DN thru 3',
    });
    expect(result.status.played).toBe(3);
    expect(result.status.lead).toBe(2);
    expect(result.error).toBeNull();
  });

  it('upsertPlayoffMatchHole forwards a null p_player2_result to the RPC when the deciding hole closes out the match early', async () => {
    // Dormie at "6 UP thru 12" (6 halved holes after 6 straight wins), then
    // hole 13 is halved too: lead stays 6 with 5 remaining -> "6 & 5",
    // and the trailer's label must become null (no UP/DN split for a
    // closeout) -- not silently omitted, since the RPC must SET it to
    // NULL rather than leave the stale "6 DN thru 12" text in place.
    const existing: HoleEntry[] = holes(['player1', 'player1', 'player1', 'player1', 'player1', 'player1', 'halve', 'halve', 'halve', 'halve', 'halve', 'halve']);
    const result = await upsertPlayoffMatchHole(supabase, 'm1', 13, 'halve', existing, 18);

    expect(mockRpc).toHaveBeenCalledWith('upsert_playoff_match_hole', {
      p_matchup_id: 'm1',
      p_hole_number: 13,
      p_result: 'halve',
      p_player1_result: '6 & 5',
      p_player2_result: null,
    });
    expect(result.status.decided).toBe(true);
  });

  it('upsertPlayoffMatchHole overwrites an existing entry for the same hole_number rather than duplicating it', async () => {
    // Hole 2 was previously logged as player2; correcting it to player1.
    const existing: HoleEntry[] = holes(['player1', 'player2']);
    const result = await upsertPlayoffMatchHole(supabase, 'm1', 2, 'player1', existing, 18);
    expect(result.status.played).toBe(2);
    expect(result.status.player1Wins).toBe(2);
    expect(result.status.player2Wins).toBe(0);
  });

  it('setPlayoffMatchStatus calls the RPC with matchup id and status', async () => {
    const result = await setPlayoffMatchStatus(supabase, 'm1', 'final');
    expect(mockRpc).toHaveBeenCalledWith('set_playoff_match_status', { p_matchup_id: 'm1', p_status: 'final' });
    expect(result.error).toBeNull();
  });

  it('confirmStrokePlayWinner calls the RPC with matchup id and winner id', async () => {
    const result = await confirmStrokePlayWinner(supabase, 'm1', 'u1');
    expect(mockRpc).toHaveBeenCalledWith('confirm_stroke_play_winner', { p_matchup_id: 'm1', p_winner_id: 'u1' });
    expect(result.error).toBeNull();
  });

  it('confirmStrokePlayWinner surfaces an RPC error message', async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: 'winner must be one of the two participants' } });
    const result = await confirmStrokePlayWinner(supabase, 'm1', 'someone-else');
    expect(result.error).toBe('winner must be one of the two participants');
  });
});

describe('resolveEventIdForMatchup', () => {
  function makeEvent(id: string, start_date: string): Event {
    return {
      id,
      season_id: 's1',
      event_number: 1,
      name: null,
      start_date,
      end_date: start_date,
      holes: 18,
      is_major: false,
      is_playoff: true,
      created_at: '',
      updated_at: '',
    };
  }

  const sortedPlayoffEvents = [
    makeEvent('e1', '2026-03-01'),
    makeEvent('e2', '2026-03-08'),
    makeEvent('e3', '2026-03-15'),
  ];

  function makeMatchup(overrides: Partial<Pick<PlayoffBracket, 'event_id' | 'round'>>): Pick<PlayoffBracket, 'event_id' | 'round'> {
    return { event_id: null, round: 1, ...overrides };
  }

  it('maps round N to the Nth playoff event by start date when no override is set', () => {
    expect(resolveEventIdForMatchup(makeMatchup({ round: 2 }), sortedPlayoffEvents)).toBe('e2');
  });

  it('prefers an explicit event_id override over the round-derived event', () => {
    expect(resolveEventIdForMatchup(makeMatchup({ round: 1, event_id: 'e3' }), sortedPlayoffEvents)).toBe('e3');
  });

  it('returns null when the round has no corresponding playoff event', () => {
    expect(resolveEventIdForMatchup(makeMatchup({ round: 4 }), sortedPlayoffEvents)).toBeNull();
  });
});

describe('resolveBestNet', () => {
  function makeScore(userId: string, net: number | null, isComplete = true): Pick<Score, 'user_id' | 'is_complete' | 'net_strokes_over_par'> {
    return { user_id: userId, is_complete: isComplete, net_strokes_over_par: net };
  }

  it('returns the single lowest net for an 18-hole matchup', () => {
    const scores = [makeScore('u1', 2), makeScore('u1', -1), makeScore('u1', 4)];
    expect(resolveBestNet(scores, 'u1', 18)).toBe(-1);
  });

  it('returns null for 18 holes when the player has no scores', () => {
    expect(resolveBestNet([], 'u1', 18)).toBeNull();
  });

  it('sums the two best nets for a 36-hole matchup', () => {
    const scores = [makeScore('u1', 2), makeScore('u1', -1), makeScore('u1', 4)];
    expect(resolveBestNet(scores, 'u1', 36)).toBe(1); // -1 + 2
  });

  it('returns null for 36 holes when the player has fewer than two complete rounds', () => {
    expect(resolveBestNet([makeScore('u1', 3)], 'u1', 36)).toBeNull();
  });

  it('returns null for 36 holes when the player has no scores', () => {
    expect(resolveBestNet([], 'u1', 36)).toBeNull();
  });

  it('ignores other players and incomplete rounds', () => {
    const scores = [
      makeScore('u1', -5, false), // incomplete, ignored
      makeScore('u2', -10), // other player, ignored
      makeScore('u1', 1),
      makeScore('u1', 3),
    ];
    expect(resolveBestNet(scores, 'u1', 18)).toBe(1);
    expect(resolveBestNet(scores, 'u1', 36)).toBe(4); // 1 + 3
  });

  it('ignores scores with a null net_strokes_over_par', () => {
    const scores = [makeScore('u1', null), makeScore('u1', 2)];
    expect(resolveBestNet(scores, 'u1', 18)).toBe(2);
  });
});

describe('isRoundComplete', () => {
  type M = Pick<PlayoffBracket, 'player1_id' | 'player2_id' | 'winner_id' | 'status'>;

  function makeMatch(overrides: Partial<M>): M {
    return { player1_id: 'p1', player2_id: 'p2', winner_id: null, status: 'scheduled', ...overrides };
  }

  it('returns false for an empty round', () => {
    expect(isRoundComplete([])).toBe(false);
  });

  it('returns false when any matchup is undecided', () => {
    const matchups = [makeMatch({ winner_id: 'p1' }), makeMatch({})];
    expect(isRoundComplete(matchups)).toBe(false);
  });

  it('returns true when every matchup has an admin-assigned winner_id', () => {
    const matchups = [makeMatch({ winner_id: 'p1' }), makeMatch({ winner_id: 'p2' })];
    expect(isRoundComplete(matchups)).toBe(true);
  });

  it('returns true when a matchup is self-service "final" without an official winner_id yet', () => {
    const matchups = [makeMatch({ status: 'final' }), makeMatch({ winner_id: 'p2' })];
    expect(isRoundComplete(matchups)).toBe(true);
  });

  it('treats a bye (no player2) as automatically decided', () => {
    const matchups = [makeMatch({ player2_id: null }), makeMatch({ winner_id: 'p2' })];
    expect(isRoundComplete(matchups)).toBe(true);
  });
});

describe('isSeedSelectionMatch', () => {
  it('is true for the championship top-2-seed matchup in round 1', () => {
    expect(isSeedSelectionMatch('championship', 1, 1, 2)).toBe(true);
  });

  it('is true regardless of which player is seed 1 vs seed 2', () => {
    expect(isSeedSelectionMatch('championship', 1, 2, 1)).toBe(true);
  });

  it('is true for the consolation top-2-seed matchup (seeds 7 & 8) in round 1', () => {
    expect(isSeedSelectionMatch('consolation', 1, 7, 8)).toBe(true);
  });

  it('is false outside round 1, even for the same seed pair', () => {
    expect(isSeedSelectionMatch('championship', 2, 1, 2)).toBe(false);
  });

  it('is false for a non-top-seed pair in round 1', () => {
    expect(isSeedSelectionMatch('championship', 1, 2, 3)).toBe(false);
  });

  it('is false for the unicorn flight regardless of seeds, since its bye goes to the last 2 seeds in a reverse bracket', () => {
    expect(isSeedSelectionMatch('unicorn', 1, 1, 2)).toBe(false);
  });

  it('is false when either seed is missing (e.g. a BYE matchup)', () => {
    expect(isSeedSelectionMatch('championship', 1, 1, undefined)).toBe(false);
  });
});

describe('computeRoundLabel', () => {
  it('labels the last round "Final" for a 6-seed flight (3 rounds)', () => {
    expect(computeRoundLabel(3, 6)).toBe('Final');
  });

  it('labels the second-to-last round "Semifinal" for a 6-seed flight', () => {
    expect(computeRoundLabel(2, 6)).toBe('Semifinal');
  });

  it('labels the third-to-last round "Quarterfinal" for a 6-seed flight', () => {
    expect(computeRoundLabel(1, 6)).toBe('Quarterfinal');
  });

  it('labels the only round "Final" for a 2-seed flight', () => {
    expect(computeRoundLabel(1, 2)).toBe('Final');
  });

  it('falls back to a plain "Round N" label further back than quarterfinals', () => {
    // a 16-seed flight has 4 rounds (ceil(log2(16))), so round 1 is two
    // rounds before the quarterfinal (round 2), landing on the fallback.
    expect(computeRoundLabel(1, 16)).toBe('Round 1');
  });

  it('falls back to "Round N" when no seed count is available for the flight', () => {
    expect(computeRoundLabel(1, 0)).toBe('Round 1');
  });
});

describe('checkAndNotifyRoundComplete', () => {
  beforeEach(() => {
    vi.mocked(notifySlack).mockClear();
  });

  function makeSupabase(siblings: unknown[]) {
    // Supabase query builders are thenable — awaiting them resolves { data, error }.
    const builder = {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      then: (resolve: (v: { data: unknown[]; error: null }) => void) => resolve({ data: siblings, error: null }),
    };
    return { from: vi.fn(() => builder) } as unknown as Parameters<typeof checkAndNotifyRoundComplete>[0];
  }

  it('fires playoff_round_complete when every sibling matchup is decided', async () => {
    const supabase = makeSupabase([
      { player1_id: 'p1', player2_id: 'p2', winner_id: 'p1', status: 'final' },
      { player1_id: 'p3', player2_id: 'p4', winner_id: 'p3', status: 'final' },
    ]);

    await checkAndNotifyRoundComplete(supabase, { season_id: 's1', flight: 'championship', round: 1 }, 'Semifinal');

    expect(notifySlack).toHaveBeenCalledWith({
      event_type: 'playoff_round_complete',
      flight: 'championship',
      round: 1,
      round_label: 'Semifinal',
      matchup_count: 2,
    });
  });

  it('does not fire when a sibling matchup is still undecided', async () => {
    const supabase = makeSupabase([
      { player1_id: 'p1', player2_id: 'p2', winner_id: 'p1', status: 'final' },
      { player1_id: 'p3', player2_id: 'p4', winner_id: null, status: 'in_progress' },
    ]);

    await checkAndNotifyRoundComplete(supabase, { season_id: 's1', flight: 'championship', round: 1 }, null);

    expect(notifySlack).not.toHaveBeenCalled();
  });

  it('swallows query errors and never throws', async () => {
    const supabase = { from: vi.fn(() => { throw new Error('boom'); }) } as unknown as Parameters<typeof checkAndNotifyRoundComplete>[0];
    await expect(checkAndNotifyRoundComplete(supabase, { season_id: 's1', flight: 'championship', round: 1 }, null)).resolves.toBeUndefined();
    expect(notifySlack).not.toHaveBeenCalled();
  });
});
