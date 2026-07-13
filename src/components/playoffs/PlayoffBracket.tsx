'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Trophy } from 'lucide-react';
import { useUser } from '@/lib/hooks/useUser';
import { useSeason } from '@/lib/hooks/useSeason';
import { resolveBestNet, resolveEventIdForMatchup } from '@/lib/playoffs';
import MatchupCard, { type BestNet } from './MatchupCard';
import type { Event, PlayoffBracket as PlayoffBracketRow, PlayoffFlight, PlayoffMatchHole, Score } from '@/types/database';

interface PlayoffSeedRow {
  id: string;
  season_id: string;
  user_id: string;
  seed_number: number;
}

const FLIGHTS: PlayoffFlight[] = ['championship', 'consolation', 'unicorn'];
const flightLabels: Record<string, string> = {
  championship: 'Championship',
  consolation: 'Consolation',
  unicorn: 'Unicorn',
};
const flightColors: Record<string, string> = {
  championship: 'bg-yellow-100 text-yellow-700',
  consolation: 'bg-blue-100 text-blue-700',
  unicorn: 'bg-purple-100 text-purple-700',
};

// Seed ranges match the admin page's getFlightForSeed: 1-6 championship,
// 7-12 consolation, 13+ unicorn.
function getFlightForSeed(seed: number): string {
  if (seed <= 6) return 'championship';
  if (seed <= 12) return 'consolation';
  return 'unicorn';
}

/**
 * Renders a full playoff bracket (flight tabs + round groups of matchup
 * cards) for a given season. Shared by the standalone /playoffs page and
 * the Leaderboard page's Playoffs tab so both stay in sync.
 *
 * Self-service controls (format/holes picker, hole-by-hole match play) and
 * the live stroke-play best-net display only apply to the season that's
 * actively in playoffs mode right now — historical seasons always render
 * their frozen read-only results, per the historical guard.
 */
export default function PlayoffBracket({ seasonId }: { seasonId: string }) {
  const [brackets, setBrackets] = useState<PlayoffBracketRow[]>([]);
  const [seeds, setSeeds] = useState<PlayoffSeedRow[]>([]);
  const [holesByMatchup, setHolesByMatchup] = useState<Record<string, PlayoffMatchHole[]>>({});
  const [bestNetByMatchup, setBestNetByMatchup] = useState<Record<string, BestNet>>({});
  const [selectedFlight, setSelectedFlight] = useState<string>('championship');
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const { profile, isAdmin } = useUser();
  const { season: currentPlayoffSeason, isPlayoffs } = useSeason();

  const isActiveSeason = isPlayoffs && currentPlayoffSeason?.id === seasonId;

  const fetchData = useCallback(async () => {
    setLoading(true);

    const { data: bracketData } = await supabase
      .from('playoff_brackets')
      .select('*, player1:users!playoff_brackets_player1_id_fkey(id, full_name, profile_picture_url), player2:users!playoff_brackets_player2_id_fkey(id, full_name, profile_picture_url)')
      .eq('season_id', seasonId)
      .order('round')
      .order('matchup_number');
    const fetchedBrackets = (bracketData as PlayoffBracketRow[]) || [];

    const { data: seedData } = await supabase
      .from('playoff_seeds')
      .select('*')
      .eq('season_id', seasonId)
      .order('seed_number');
    const fetchedSeeds = (seedData as PlayoffSeedRow[]) || [];

    let grouped: Record<string, PlayoffMatchHole[]> = {};
    const matchupIds = fetchedBrackets.map((b) => b.id);
    if (matchupIds.length > 0) {
      const { data: holesData } = await supabase
        .from('playoff_match_holes')
        .select('*')
        .in('matchup_id', matchupIds);
      grouped = ((holesData as PlayoffMatchHole[]) || []).reduce<Record<string, PlayoffMatchHole[]>>((acc, h) => {
        (acc[h.matchup_id] ??= []).push(h);
        return acc;
      }, {});
    }

    // Best-net is a live, compute-on-read display for stroke-play (and
    // undecided-format, which defaults to stroke play) matchups — and ONLY
    // for the season that's actively in playoffs mode right now. Historical
    // seasons never query scores here; they keep their frozen free-text
    // results, per the historical-season guard.
    let bestNet: Record<string, BestNet> = {};
    if (isActiveSeason) {
      const strokeMatchups = fetchedBrackets.filter(
        (b) => (b.format ?? 'stroke_play') === 'stroke_play' && b.player1_id && b.player2_id
      );

      if (strokeMatchups.length > 0) {
        const { data: eventsData } = await supabase
          .from('events')
          .select('*')
          .eq('season_id', seasonId)
          .eq('is_playoff', true)
          .order('start_date');
        const playoffEvents = (eventsData as Event[]) || [];

        const matchupEventId = new Map<string, string | null>();
        const eventIds = new Set<string>();
        for (const m of strokeMatchups) {
          const eventId = resolveEventIdForMatchup(m, playoffEvents);
          matchupEventId.set(m.id, eventId);
          if (eventId) eventIds.add(eventId);
        }

        let scores: Score[] = [];
        if (eventIds.size > 0) {
          const { data: scoresData } = await supabase
            .from('scores')
            .select('user_id, event_id, is_complete, net_strokes_over_par')
            .in('event_id', Array.from(eventIds));
          scores = (scoresData as Score[]) || [];
        }

        bestNet = strokeMatchups.reduce<Record<string, BestNet>>((acc, m) => {
          const eventId = matchupEventId.get(m.id) ?? null;
          const eventScores = eventId ? scores.filter((s) => s.event_id === eventId) : [];
          const holes = m.holes === 36 ? 36 : 18;
          acc[m.id] = {
            player1: m.player1_id ? resolveBestNet(eventScores, m.player1_id, holes) : null,
            player2: m.player2_id ? resolveBestNet(eventScores, m.player2_id, holes) : null,
          };
          return acc;
        }, {});
      }
    }

    setBrackets(fetchedBrackets);
    setSeeds(fetchedSeeds);
    setHolesByMatchup(grouped);
    setBestNetByMatchup(bestNet);

    const availableFlights = FLIGHTS.filter((f) => fetchedBrackets.some((b) => b.flight === f));
    setSelectedFlight((prev) => (
      availableFlights.length > 0 && !availableFlights.includes(prev as PlayoffFlight)
        ? availableFlights[0]
        : prev
    ));

    setLoading(false);
  }, [seasonId, supabase, isActiveSeason]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const seedMap = new Map<string, number>();
  seeds.forEach((s) => seedMap.set(s.user_id, s.seed_number));

  const availableFlights = FLIGHTS.filter((f) => brackets.some((b) => b.flight === f));

  const flightBrackets = brackets.filter((b) => b.flight === selectedFlight);
  const rounds = [...new Set(flightBrackets.map((b) => b.round))].sort();

  // Anchor labels to the total number of rounds the bracket SHOULD have
  // (derived from the flight's seed count), not just the rounds that
  // happen to exist yet — otherwise a lone round 1 reads as "Final".
  const seedCountForFlight = seeds.filter((s) => getFlightForSeed(s.seed_number) === selectedFlight).length;
  const totalRounds = seedCountForFlight > 0
    ? Math.ceil(Math.log2(seedCountForFlight))
    : (rounds.length > 0 ? Math.max(...rounds) : 0);

  const roundLabels: Record<number, string> = {};
  for (const r of rounds) {
    if (r === totalRounds) roundLabels[r] = 'Final';
    else if (r === totalRounds - 1) roundLabels[r] = 'Semifinal';
    else if (r === totalRounds - 2) roundLabels[r] = 'Quarterfinal';
    else roundLabels[r] = `Round ${r}`;
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-20 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />)}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Flight Tabs — only show when there's more than one flight to choose from */}
      {availableFlights.length > 1 && (
        <div className="flex gap-2">
          {availableFlights.map((f) => {
            const count = brackets.filter((b) => b.flight === f).length;
            return (
              <button
                key={f}
                onClick={() => setSelectedFlight(f)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg flex items-center gap-1 ${
                  selectedFlight === f ? flightColors[f] : 'bg-[var(--bg-subtle)] text-[var(--text-muted)]'
                }`}
              >
                {flightLabels[f]}
                <span className="text-[10px] opacity-60">({count})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Unicorn reverse bracket banner */}
      {selectedFlight === 'unicorn' && (
        <div className="flex items-center gap-2 px-3 py-2 bg-purple-50 border border-purple-200 rounded-xl text-sm text-purple-700">
          <span className="text-base">🦄</span>
          <span>Reverse bracket — the <strong>loser</strong> of each matchup advances. The last player standing is crowned the Unicorn.</span>
        </div>
      )}

      {flightBrackets.length === 0 ? (
        <div className="text-center py-12">
          <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-sm text-[var(--text-muted)]">No playoff brackets yet for {flightLabels[selectedFlight]}.</p>
        </div>
      ) : (
        /* Bracket - vertical on mobile, horizontal on wider screens */
        <div className="space-y-4">
          {rounds.map((round) => {
            const roundMatchups = flightBrackets.filter((b) => b.round === round);
            return (
              <div key={round}>
                <h3 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wide mb-2">
                  {roundLabels[round]}
                  <span className="ml-1.5 normal-case tracking-normal opacity-60">
                    ({roundMatchups.length} matchup{roundMatchups.length !== 1 ? 's' : ''})
                  </span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {roundMatchups.map((match) => (
                    <MatchupCard
                      key={match.id}
                      match={match}
                      seedMap={seedMap}
                      isActiveSeason={isActiveSeason}
                      currentUserId={profile?.id}
                      isAdmin={isAdmin}
                      holes={holesByMatchup[match.id] || []}
                      bestNet={bestNetByMatchup[match.id]}
                      roundLabel={roundLabels[round]}
                      onRefresh={fetchData}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
