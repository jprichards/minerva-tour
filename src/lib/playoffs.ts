/**
 * Playoffs self-service helpers: match-play status/closeout computation
 * and thin wrappers around the SECURITY DEFINER RPCs that let a matchup's
 * participants (or an admin) update format, hole results, and status
 * without a service-role key. See supabase/add-playoff-format.sql for the
 * RPC definitions this file calls.
 */

import { createClient } from '@/lib/supabase/client';
import { notifySlack } from '@/lib/slack-notify';
import type { Event, PlayoffBracket, PlayoffFlight, PlayoffFormat, PlayoffHoleResult, PlayoffMatchStatus, Score } from '@/types/database';

type SupabaseClient = ReturnType<typeof createClient>;

export interface HoleEntry {
  hole_number: number;
  result: PlayoffHoleResult;
}

export type MatchLeader = 'player1' | 'player2' | null;

export interface MatchStatus {
  player1Wins: number;
  player2Wins: number;
  played: number;
  remaining: number;
  lead: number;
  leader: MatchLeader;
  decided: boolean;
  dormie: boolean;
  /** Human-readable status from the leader's perspective, e.g. "4 UP thru 7", "3 & 2". */
  statusText: string;
}

/**
 * Computes running match-play status + closeout from a list of hole
 * results. Works identically for 18- and 36-hole matches via `totalHoles`.
 * See plan Appendix B for the exact algorithm + test vectors.
 */
export function computeMatchStatus(holes: HoleEntry[], totalHoles: 18 | 36): MatchStatus {
  const player1Wins = holes.filter((h) => h.result === 'player1').length;
  const player2Wins = holes.filter((h) => h.result === 'player2').length;
  const played = holes.length;
  const lead = Math.abs(player1Wins - player2Wins);
  const leader: MatchLeader = player1Wins > player2Wins ? 'player1' : player2Wins > player1Wins ? 'player2' : null;
  const remaining = totalHoles - played;
  const decided = lead > remaining;
  const dormie = lead === remaining && lead > 0 && !decided;

  let statusText: string;
  if (played === 0) {
    statusText = 'Not started';
  } else if (decided && remaining > 0) {
    statusText = `${lead} & ${remaining}`;
  } else if (played === totalHoles && lead > 0) {
    statusText = `${lead} UP`;
  } else if (played === totalHoles && lead === 0) {
    statusText = 'All Square (halved)';
  } else if (lead === 0) {
    statusText = `All Square thru ${played}`;
  } else {
    statusText = `${lead} UP thru ${played}`;
  }

  return { player1Wins, player2Wins, played, remaining, lead, leader, decided, dormie, statusText };
}

/**
 * Per-player display label derived from a computed MatchStatus: the
 * leader gets the full status text, the trailer gets a "DN" mirror of it,
 * ties show "AS", and an unplayed match shows no label at all (null).
 */
export function perPlayerLabel(status: MatchStatus, player: 'player1' | 'player2'): string | null {
  if (status.played === 0) return null;
  if (status.lead === 0) return 'AS';
  if (status.leader === player) return status.statusText;
  return status.statusText.replace('UP', 'DN');
}

/**
 * Mirrors a computed MatchStatus into the player1_result/player2_result
 * text columns so the bracket + admin view display it without needing to
 * recompute from the raw hole rows.
 */
export function mirrorResultLabels(status: MatchStatus): { player1_result: string | null; player2_result: string | null } {
  return {
    player1_result: perPlayerLabel(status, 'player1'),
    player2_result: perPlayerLabel(status, 'player2'),
  };
}

interface RpcResult {
  error: string | null;
}

/**
 * Sets a matchup's format + hole count. Callable by either participant
 * or an admin (enforced server-side by is_playoff_participant_or_admin).
 */
export async function setPlayoffMatchupFormat(
  supabase: SupabaseClient,
  matchupId: string,
  format: PlayoffFormat,
  holes: 18 | 36
): Promise<RpcResult> {
  const { error } = await supabase.rpc('set_playoff_matchup_format', {
    p_matchup_id: matchupId,
    p_format: format,
    p_holes: holes,
  });
  return { error: error?.message ?? null };
}

/**
 * Records/updates a single hole result for a match-play matchup, computes
 * the resulting running status from the full hole list, and mirrors it
 * into player1_result/player2_result in the same RPC call.
 */
export async function upsertPlayoffMatchHole(
  supabase: SupabaseClient,
  matchupId: string,
  holeNumber: number,
  result: PlayoffHoleResult,
  existingHoles: HoleEntry[],
  totalHoles: 18 | 36
): Promise<RpcResult & { status: MatchStatus }> {
  const updatedHoles = [
    ...existingHoles.filter((h) => h.hole_number !== holeNumber),
    { hole_number: holeNumber, result },
  ];
  const status = computeMatchStatus(updatedHoles, totalHoles);
  const labels = mirrorResultLabels(status);

  const { error } = await supabase.rpc('upsert_playoff_match_hole', {
    p_matchup_id: matchupId,
    p_hole_number: holeNumber,
    p_result: result,
    p_player1_result: labels.player1_result,
    p_player2_result: labels.player2_result,
  });

  return { error: error?.message ?? null, status };
}

/**
 * Sets a matchup's status (e.g. marking a match-play matchup final once
 * the players agree it's over). Never touches winner_id — that stays
 * admin-only in /admin/playoffs.
 */
export async function setPlayoffMatchStatus(
  supabase: SupabaseClient,
  matchupId: string,
  status: PlayoffMatchStatus
): Promise<RpcResult> {
  const { error } = await supabase.rpc('set_playoff_match_status', {
    p_matchup_id: matchupId,
    p_status: status,
  });
  return { error: error?.message ?? null };
}

/**
 * Resolves which event's scores a matchup's stroke-play best-net should
 * read from: an explicit admin override on the matchup wins, otherwise
 * round N maps to the Nth `is_playoff` event of the season by start date.
 * Returns null when neither is available (e.g. round has no matching
 * event yet) — callers must treat that as "can't compute best-net yet".
 */
export function resolveEventIdForMatchup(
  matchup: Pick<PlayoffBracket, 'event_id' | 'round'>,
  seasonPlayoffEventsSortedByStartDate: Event[]
): string | null {
  if (matchup.event_id != null) return matchup.event_id;
  const idx = matchup.round - 1;
  return seasonPlayoffEventsSortedByStartDate[idx]?.id ?? null;
}

/**
 * Resolves a player's stroke-play best net for a matchup from their scores
 * in the resolved event. 18-hole matches use the single best net round;
 * 36-hole matches combine the two best net rounds (null if fewer than two
 * complete rounds exist yet — never guess from partial data).
 */
export function resolveBestNet(
  scores: Pick<Score, 'user_id' | 'is_complete' | 'net_strokes_over_par'>[],
  userId: string,
  holes: 18 | 36
): number | null {
  const nets = scores
    .filter((s) => s.user_id === userId && s.is_complete && s.net_strokes_over_par != null)
    .map((s) => s.net_strokes_over_par as number);

  if (nets.length === 0) return null;
  if (holes === 18) return Math.min(...nets);

  if (nets.length < 2) return null;
  const sorted = [...nets].sort((a, b) => a - b);
  return sorted[0] + sorted[1];
}

/**
 * A round is complete once every matchup in it is decided: a bye
 * (auto-advances), an admin-assigned winner_id, or a self-service
 * status of 'final' (participants agreeing a match-play matchup is over,
 * ahead of any official winner_id the admin assigns later). Checking
 * both signals means round-complete detection works whether the round
 * finished via self-service match play or an admin setting a stroke-play
 * winner.
 */
export function isRoundComplete(
  matchups: Pick<PlayoffBracket, 'player1_id' | 'player2_id' | 'winner_id' | 'status'>[]
): boolean {
  if (matchups.length === 0) return false;
  return matchups.every((m) => {
    const isBye = !!m.player1_id && !m.player2_id;
    return isBye || m.winner_id != null || m.status === 'final';
  });
}

/**
 * After a matchup becomes decided, re-queries its round siblings and fires
 * a single playoff_round_complete notification the moment the whole round
 * is done. Best-effort: swallows errors since this is purely a Slack nice-to-have.
 */
export async function checkAndNotifyRoundComplete(
  supabase: SupabaseClient,
  matchup: { season_id: string; flight: string; round: number },
  roundLabel: string | null
): Promise<void> {
  try {
    const { data } = await supabase
      .from('playoff_brackets')
      .select('player1_id, player2_id, winner_id, status')
      .eq('season_id', matchup.season_id)
      .eq('flight', matchup.flight)
      .eq('round', matchup.round);

    const siblings = (data as Pick<PlayoffBracket, 'player1_id' | 'player2_id' | 'winner_id' | 'status'>[]) || [];
    if (!isRoundComplete(siblings)) return;

    notifySlack({
      event_type: 'playoff_round_complete',
      flight: matchup.flight as PlayoffFlight,
      round: matchup.round,
      round_label: roundLabel,
      matchup_count: siblings.length,
    });
  } catch {
    // Best-effort — never block the caller's own success path.
  }
}
