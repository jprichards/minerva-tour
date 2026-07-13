'use client';

import { useState } from 'react';
import { ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';
import Avatar from '@/components/Avatar';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/Toast';
import { logAuditEvent } from '@/lib/audit';
import { notifySlack } from '@/lib/slack-notify';
import { formatNetScore } from '@/lib/scoring';
import {
  computeMatchStatus,
  setPlayoffMatchupFormat,
  upsertPlayoffMatchHole,
  setPlayoffMatchStatus,
  checkAndNotifyRoundComplete,
  type HoleEntry,
} from '@/lib/playoffs';
import type { PlayoffBracket, PlayoffFormat, PlayoffMatchHole, User } from '@/types/database';

export interface BestNet {
  player1: number | null;
  player2: number | null;
}

const HOLE_CHOICES: Array<{ value: 'player1' | 'halve' | 'player2'; label: string }> = [
  { value: 'player1', label: 'P1' },
  { value: 'halve', label: 'AS' },
  { value: 'player2', label: 'P2' },
];

/**
 * Renders a single playoff matchup: two player slots (or a BYE for the
 * second slot) with winner/loser styling. Shared between the standalone
 * /playoffs page and the Leaderboard page's Playoffs tab so both stay
 * visually and behaviorally identical.
 *
 * When `isActiveSeason` is true and the viewer is a participant or admin,
 * also renders self-service controls: a format/holes picker (once) and,
 * for match play, a hole-by-hole entry grid with live running status.
 *
 * The live best-net display for stroke play (`bestNet`), by contrast, is
 * shown to ANY viewer of the active season — not just participants —
 * since following the live leaderboard is the whole point (mirrors how
 * match-play status is already visible to everyone via player1_result/
 * player2_result). Undecided format (`match.format === null`) defaults to
 * stroke play per the rulebook, so best-net is computed for that case too.
 */
export default function MatchupCard({
  match,
  seedMap,
  isActiveSeason = false,
  currentUserId = null,
  isAdmin = false,
  holes = [],
  bestNet = { player1: null, player2: null },
  roundLabel = null,
  onRefresh,
}: {
  match: PlayoffBracket;
  seedMap: Map<string, number>;
  isActiveSeason?: boolean;
  currentUserId?: string | null;
  isAdmin?: boolean;
  holes?: PlayoffMatchHole[];
  bestNet?: BestNet;
  roundLabel?: string | null;
  onRefresh?: () => void | Promise<void>;
}) {
  const isBye = !!match.player1_id && !match.player2_id;
  const isParticipant = !!currentUserId && (currentUserId === match.player1_id || currentUserId === match.player2_id);
  const canSelfService = isActiveSeason && !isBye && (isParticipant || isAdmin);
  // The FormatPicker renders whenever a self-service-capable viewer hasn't
  // chosen a format yet. Undecided defaults to stroke play for DISPLAY
  // purposes (spectators still see a live best-net), but that default must
  // not bleed into the picker itself — telling a player "Stroke play —
  // best net will update..." right below a still-open Stroke/Match choice
  // reads as though the pick has already been made for them.
  const formatPending = canSelfService && !match.format;

  const effectiveFormat = match.format ?? 'stroke_play';
  const showLiveNet = isActiveSeason && !isBye && effectiveFormat === 'stroke_play' && !formatPending;
  const hasBothNets = showLiveNet && bestNet.player1 != null && bestNet.player2 != null;
  const p1Leads = hasBothNets && (bestNet.player1 as number) < (bestNet.player2 as number);
  const p2Leads = hasBothNets && (bestNet.player2 as number) < (bestNet.player1 as number);

  const player1Result = showLiveNet
    ? (bestNet.player1 != null ? formatNetScore(bestNet.player1) : null)
    : match.player1_result;
  const player2Result = showLiveNet
    ? (bestNet.player2 != null ? formatNetScore(bestNet.player2) : null)
    : match.player2_result;

  return (
    <div className="bg-[var(--bg-card)] rounded-xl border border-[var(--border-light)] shadow-[var(--shadow-sm)] overflow-hidden">
      <PlayerSlot
        player={match.player1}
        seed={match.player1_id ? seedMap.get(match.player1_id) : undefined}
        result={player1Result}
        isWinner={match.winner_id !== null && match.winner_id === match.player1_id}
        isLoser={match.winner_id !== null && match.winner_id === match.player2_id}
        isLiveLeader={p1Leads}
      />
      <div className="border-t border-[var(--border-light)]" />
      {isBye ? (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--bg-page)] opacity-50">
          <div className="w-7 h-7 rounded-full bg-[var(--bg-subtle)] flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-[var(--text-faint)]">-</span>
          </div>
          <span className="text-sm italic text-[var(--text-faint)]">BYE</span>
        </div>
      ) : (
        <PlayerSlot
          player={match.player2}
          seed={match.player2_id ? seedMap.get(match.player2_id) : undefined}
          result={player2Result}
          isWinner={match.winner_id !== null && match.winner_id === match.player2_id}
          isLoser={match.winner_id !== null && match.winner_id === match.player1_id}
          isLiveLeader={p2Leads}
        />
      )}

      {canSelfService && !match.format && (
        <FormatPicker match={match} roundLabel={roundLabel} onRefresh={onRefresh} />
      )}

      {canSelfService && match.format === 'match_play' && (
        <MatchPlayGrid match={match} holes={holes} roundLabel={roundLabel} onRefresh={onRefresh} />
      )}

      {showLiveNet && (
        <div className="border-t border-[var(--border-light)] px-3 py-2.5 bg-[var(--bg-page)]">
          <p className="text-xs text-[var(--text-faint)]">
            {bestNet.player1 == null && bestNet.player2 == null
              ? 'Stroke play — best net will update automatically once scores are posted.'
              : 'Stroke play — best net updates automatically from posted scores.'}
          </p>
        </div>
      )}
    </div>
  );
}

function PlayerSlot({ player, seed, result, isWinner, isLoser, isLiveLeader = false }: {
  player?: Pick<User, 'id' | 'full_name' | 'profile_picture_url'> | null;
  seed?: number;
  result?: string | null;
  isWinner: boolean;
  isLoser: boolean;
  isLiveLeader?: boolean;
}) {
  return (
    <div className={`flex items-center gap-2 px-3 py-2.5 ${isWinner ? 'bg-green-50' : isLoser ? 'bg-[var(--bg-page)] opacity-60' : ''}`}>
      {seed !== undefined && (
        <span className="text-[10px] font-bold text-minerva-600 bg-minerva-50 border border-minerva-200 px-1 py-0.5 rounded flex-shrink-0">
          #{seed}
        </span>
      )}
      <Avatar
        src={player?.profile_picture_url}
        name={player?.full_name}
        className="w-7 h-7 bg-[var(--bg-subtle)] flex-shrink-0"
        textClassName="text-[10px] font-bold text-[var(--text-muted)]"
      />
      <span className={`text-sm truncate ${isWinner ? 'font-bold text-green-700' : 'font-medium text-[var(--text-secondary)]'}`}>
        {player?.full_name || 'TBD'}
      </span>
      {result && (
        <span className={`text-xs font-semibold ml-auto flex-shrink-0 ${
          isWinner ? 'text-green-600' : isLiveLeader ? 'text-minerva-600' : 'text-[var(--text-faint)]'
        }`}>
          {result}
        </span>
      )}
      {isWinner && !result && <ChevronRight className="w-4 h-4 text-green-600 ml-auto flex-shrink-0" />}
    </div>
  );
}

function FormatPicker({ match, roundLabel, onRefresh }: {
  match: PlayoffBracket;
  roundLabel?: string | null;
  onRefresh?: () => void | Promise<void>;
}) {
  const [pendingHoles, setPendingHoles] = useState<18 | 36>(18);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();
  const supabase = createClient();

  const handleChoose = async (format: PlayoffFormat) => {
    setSaving(true);
    const { error } = await setPlayoffMatchupFormat(supabase, match.id, format, pendingHoles);
    setSaving(false);
    if (error) {
      showToast(`Failed to set format: ${error}`, 'error');
      return;
    }
    logAuditEvent('set_playoff_format', 'playoff_bracket', match.id, { format, holes: pendingHoles });
    notifySlack({
      event_type: 'playoff_format_set',
      flight: match.flight,
      round: match.round,
      round_label: roundLabel,
      player1_name: match.player1?.full_name || 'Player 1',
      player2_name: match.player2?.full_name || 'Player 2',
      format,
      holes: pendingHoles,
    });
    showToast('Format set!', 'success');
    await onRefresh?.();
  };

  return (
    <div className="border-t border-[var(--border-light)] px-3 py-3 bg-[var(--bg-page)] space-y-2.5">
      <p className="text-xs font-medium text-[var(--text-secondary)]">Choose a format for this matchup</p>
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--text-faint)] flex-shrink-0">Holes:</span>
        {[18, 36].map((h) => (
          <button
            key={h}
            type="button"
            onClick={() => setPendingHoles(h as 18 | 36)}
            className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold ${
              pendingHoles === h ? 'bg-minerva-600 text-white' : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
            }`}
          >
            {h}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => handleChoose('stroke_play')}
          className="flex-1 min-h-[44px] rounded-lg text-xs font-semibold bg-[var(--bg-subtle)] text-[var(--text-primary)] disabled:opacity-50"
        >
          Stroke Play
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={() => handleChoose('match_play')}
          className="flex-1 min-h-[44px] rounded-lg text-xs font-semibold bg-minerva-600 text-white disabled:opacity-50"
        >
          Match Play
        </button>
      </div>
    </div>
  );
}

function MatchPlayGrid({ match, holes, roundLabel, onRefresh }: {
  match: PlayoffBracket;
  holes: PlayoffMatchHole[];
  roundLabel?: string | null;
  onRefresh?: () => void | Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [savingHole, setSavingHole] = useState<number | null>(null);
  const [markingFinal, setMarkingFinal] = useState(false);
  const { showToast } = useToast();
  const supabase = createClient();

  const totalHoles = (match.holes === 36 ? 36 : 18) as 18 | 36;
  const holeEntries: HoleEntry[] = holes.map((h) => ({ hole_number: h.hole_number, result: h.result }));
  const holeMap = new Map(holeEntries.map((h) => [h.hole_number, h.result]));
  const status = computeMatchStatus(holeEntries, totalHoles);
  const player1Name = match.player1?.full_name || 'Player 1';
  const player2Name = match.player2?.full_name || 'Player 2';

  const handleHole = async (holeNumber: number, result: 'player1' | 'halve' | 'player2') => {
    const isFirstHole = holeEntries.length === 0;
    setSavingHole(holeNumber);
    const { error, status: newStatus } = await upsertPlayoffMatchHole(supabase, match.id, holeNumber, result, holeEntries, totalHoles);
    setSavingHole(null);
    if (error) {
      showToast(`Failed to log hole: ${error}`, 'error');
      return;
    }
    logAuditEvent('log_playoff_hole', 'playoff_bracket', match.id, { hole_number: holeNumber, result });

    if (isFirstHole) {
      notifySlack({
        event_type: 'playoff_match_start',
        flight: match.flight,
        round: match.round,
        round_label: roundLabel,
        player1_name: player1Name,
        player2_name: player2Name,
        format: 'match_play',
        holes: totalHoles,
      });
    } else {
      notifySlack({
        event_type: 'playoff_status_update',
        flight: match.flight,
        round: match.round,
        round_label: roundLabel,
        player1_name: player1Name,
        player2_name: player2Name,
        status_text: newStatus.statusText,
        hole_number: holeNumber,
      });
    }

    await onRefresh?.();
  };

  const handleMarkFinal = async () => {
    setMarkingFinal(true);
    const { error } = await setPlayoffMatchStatus(supabase, match.id, 'final');
    setMarkingFinal(false);
    if (error) {
      showToast(`Failed to mark final: ${error}`, 'error');
      return;
    }
    logAuditEvent('set_playoff_match_status', 'playoff_bracket', match.id, { status: 'final' });

    if (status.leader) {
      const winnerName = status.leader === 'player1' ? player1Name : player2Name;
      notifySlack({
        event_type: 'playoff_match_final',
        flight: match.flight,
        round: match.round,
        round_label: roundLabel,
        player1_name: player1Name,
        player2_name: player2Name,
        winner_name: winnerName,
        status_text: status.statusText,
      });
    }
    checkAndNotifyRoundComplete(supabase, match, roundLabel ?? null);

    showToast('Match marked final!', 'success');
    await onRefresh?.();
  };

  return (
    <div className="border-t border-[var(--border-light)] bg-[var(--bg-page)] px-3 py-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-[var(--text-secondary)] truncate">{status.statusText}</span>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-1 text-xs font-medium text-minerva-600 flex-shrink-0"
        >
          {expanded ? 'Hide holes' : 'Log holes'}
          {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        </button>
      </div>

      {expanded && (
        <div className="space-y-1 max-h-72 overflow-y-auto pr-0.5">
          {Array.from({ length: totalHoles }, (_, i) => i + 1).map((holeNumber) => {
            const current = holeMap.get(holeNumber);
            return (
              <div key={holeNumber} className="flex items-center gap-1.5">
                <span className="w-8 text-[11px] font-medium text-[var(--text-muted)] flex-shrink-0">#{holeNumber}</span>
                <div className="flex-1 grid grid-cols-3 gap-1">
                  {HOLE_CHOICES.map((choice) => (
                    <button
                      key={choice.value}
                      type="button"
                      disabled={savingHole === holeNumber}
                      onClick={() => handleHole(holeNumber, choice.value)}
                      className={`min-h-[36px] rounded-md text-[11px] font-semibold transition-colors disabled:opacity-50 ${
                        current === choice.value ? 'bg-minerva-600 text-white' : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                      }`}
                    >
                      {choice.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {match.status !== 'final' && status.played > 0 && (
        <button
          type="button"
          disabled={markingFinal}
          onClick={handleMarkFinal}
          className="w-full min-h-[40px] rounded-lg text-xs font-semibold bg-minerva-100 text-minerva-700 disabled:opacity-50"
        >
          {markingFinal ? 'Saving...' : 'Mark Match Final'}
        </button>
      )}
    </div>
  );
}
