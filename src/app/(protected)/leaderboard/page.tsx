'use client';

import { useState, useMemo, useEffect } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { createClient } from '@/lib/supabase/client';
import { useUser } from '@/lib/hooks/useUser';
import { Trophy, Medal, TrendingUp, AlertCircle, Download } from 'lucide-react';
import { downloadCSV, downloadPDF, generateLeaderboardHTML } from '@/lib/export';
import { useSeason } from '@/lib/hooks/useSeason';
import { calculateRegularEventPoints, calculateMajorEventPoints, splitTiedPoints, formatNetScore, calculateNetScore, calculateScratchScore, calculatePlayingHandicap, calculateProjectedScore, getMaxHoles } from '@/lib/scoring';
import type { Score, Event, Season } from '@/types/database';

type ViewMode = 'event' | 'season';
type ScoringMode = 'net' | 'scratch';

interface LeaderboardEntry {
  userId: string;
  playerName: string;
  profilePicture: string | null;
  bestNetOverPar: number | null;
  bestGrossScore: number | null;
  grossOverPar: number | null;
  scratchOverRating: number | null;
  actualGross: number | null;
  actualNetOverPar: number | null;
  actualScratchOverRating: number | null;
  holesPlayed: number | null;
  maxHoles: number;
  courseName: string;
  teeName: string;
  isComplete: boolean;
  projectedPoints: number;
}

interface SeasonStanding {
  userId: string;
  playerName: string;
  profilePicture: string | null;
  totalPoints: number;
  eventsPlayed: number;
}

export default function LeaderboardPage() {
  const { profile } = useUser();
  const { isOffSeason } = useSeason();
  const [view, setView] = useState<ViewMode>('event');
  const [scoringMode, setScoringMode] = useState<ScoringMode>('net');
  const supabase = createClient();

  const { data: leaderboardData, isLoading: loading } = useSWR(
    'leaderboard',
    async () => {
      // Get current season
      const { data: seasons } = await supabase
        .from('seasons')
        .select('*')
        .order('year', { ascending: false })
        .limit(1);

      if (!seasons || seasons.length === 0) {
        return {
          currentSeason: null as Season | null,
          currentEvent: null as Event | null,
          eventScores: [] as Score[],
          allSeasonScores: [] as Score[],
          seasonEvents: [] as Event[],
        };
      }

      const season = seasons[0];

      // Get all events for this season
      const { data: events } = await supabase
        .from('events')
        .select('*')
        .eq('season_id', season.id)
        .order('event_number');

      // Get current event
      const today = new Date().toISOString().split('T')[0];
      let activeEvent: Event | null = null;

      if (season.current_event_id) {
        const found = events?.find((e) => e.id === season.current_event_id);
        if (found) activeEvent = found;
      }

      if (!activeEvent && events) {
        const active = events.find(
          (e) => e.start_date <= today && e.end_date >= today
        );
        if (active) activeEvent = active;
      }

      // Get scores for current event
      let eventScores: Score[] = [];
      if (activeEvent) {
        const { data: scores } = await supabase
          .from('scores')
          .select('*, course:courses(*), user:users!user_id(full_name, email, profile_picture_url, handicap_index)')
          .eq('event_id', activeEvent.id);
        eventScores = scores || [];
      }

      // Get all season scores
      let allSeasonScores: Score[] = [];
      if (events && events.length > 0) {
        const eventIds = events.map((e) => e.id);
        const { data: scores } = await supabase
          .from('scores')
          .select('*, course:courses(*), user:users!user_id(full_name, email, profile_picture_url), event:events(*)')
          .in('event_id', eventIds);
        allSeasonScores = scores || [];
      }

      return {
        currentSeason: season as Season,
        currentEvent: activeEvent,
        eventScores,
        allSeasonScores,
        seasonEvents: (events || []) as Event[],
      };
    },
    { revalidateOnFocus: true, dedupingInterval: 5000 }
  );

  const { mutate: globalMutate } = useSWRConfig();

  const currentSeason = leaderboardData?.currentSeason ?? null;
  const currentEvent = leaderboardData?.currentEvent ?? null;
  const eventScores = leaderboardData?.eventScores ?? [];
  const allSeasonScores = leaderboardData?.allSeasonScores ?? [];
  const seasonEvents = leaderboardData?.seasonEvents ?? [];

  // Realtime subscription: refresh leaderboard when scores change
  useEffect(() => {
    const channel = supabase
      .channel('leaderboard-scores')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scores' },
        () => {
          // Revalidate the leaderboard SWR cache when any score changes
          globalMutate('leaderboard');
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, globalMutate]);

  // Build event leaderboard
  const eventLeaderboard = useMemo((): LeaderboardEntry[] => {
    if (!currentEvent || eventScores.length === 0) return [];

    // After event window closes, only completed rounds count.
    // During an active event, include completed rounds and in-progress rounds
    // that have a gross score entered. Exclude bare tee times (no score data)
    // since they haven't started scoring and shouldn't appear on the leaderboard.
    const today = new Date().toISOString().split('T')[0];
    const eventEnded = currentEvent.end_date < today;
    const eligibleScores = eventEnded
      ? eventScores.filter((s) => s.is_complete)
      : eventScores.filter((s) => s.is_complete || s.gross_score != null);

    if (eligibleScores.length === 0) return [];

    // Group by user, find best net score per user
    const byUser: Record<string, Score[]> = {};
    for (const score of eligibleScores) {
      if (!byUser[score.user_id]) byUser[score.user_id] = [];
      byUser[score.user_id].push(score);
    }

    const entries: LeaderboardEntry[] = [];
    for (const [userId, scores] of Object.entries(byUser)) {
      // Find best score based on scoring mode
      let bestScore: Score | null = null;

      if (scoringMode === 'net') {
        const completedScores = scores.filter((s) => s.is_complete && s.net_strokes_over_par != null);
        const inProgressScores = scores.filter((s) => !s.is_complete && s.gross_score != null);
        const allowanceNet = currentSeason?.handicap_allowance ?? 95;

        if (completedScores.length > 0) {
          bestScore = completedScores.reduce((best, s) => {
            const sNop = s.net_strokes_over_par ?? 999;
            const bNop = best.net_strokes_over_par ?? 999;
            if (sNop < bNop) return s;
            if (sNop === bNop && s.points_awarded != null && best.points_awarded == null) return s;
            return best;
          });
        } else if (inProgressScores.length > 0) {
          bestScore = inProgressScores.reduce((best, s) => {
            const sMax = getMaxHoles(s.course?.type || '18_holes');
            const bMax = getMaxHoles(best.course?.type || '18_holes');
            const sIdx = s.handicap_index_used ?? s.user?.handicap_index ?? 0;
            const bIdx = best.handicap_index_used ?? best.user?.handicap_index ?? 0;
            const sPH = s.course ? calculatePlayingHandicap(sIdx, s.course.slope, s.course.rating, s.course.par, allowanceNet) : 0;
            const bPH = best.course ? calculatePlayingHandicap(bIdx, best.course.slope, best.course.rating, best.course.par, allowanceNet) : 0;
            const sProj = s.course ? calculateProjectedScore(s.gross_score!, s.holes_played || 0, sMax, sPH, s.course.par, s.course.rating).projectedNetOverPar : 999;
            const bProj = best.course ? calculateProjectedScore(best.gross_score!, best.holes_played || 0, bMax, bPH, best.course.par, best.course.rating).projectedNetOverPar : 999;
            return sProj < bProj ? s : best;
          });
        }
      } else {
        // Scratch: use gross score relative to course rating (no handicap)
        // For in-progress rounds, use projected scratch to compare
        const allowance = currentSeason?.handicap_allowance ?? 95;
        const withGross = scores.filter((s) => s.gross_score != null);
        if (withGross.length > 0) {
          bestScore = withGross.reduce((best, s) => {
            const sMax = getMaxHoles(s.course?.type || '18_holes');
            const sPartial = !s.is_complete && (s.holes_played || 0) < sMax;
            let sScratch: number;
            if (sPartial && s.course) {
              const hIdx = s.handicap_index_used ?? s.user?.handicap_index ?? 0;
              const ph = calculatePlayingHandicap(hIdx, s.course.slope, s.course.rating, s.course.par, allowance);
              sScratch = calculateProjectedScore(s.gross_score!, s.holes_played || 0, sMax, ph, s.course.par, s.course.rating).projectedScratchOverRating;
            } else {
              sScratch = calculateScratchScore(s.gross_score!, s.course?.rating || 72, s.course?.par || 72, s.holes_played || sMax, sMax).scratchStrokesOverRating;
            }

            const bMax = getMaxHoles(best.course?.type || '18_holes');
            const bPartial = !best.is_complete && (best.holes_played || 0) < bMax;
            let bScratch: number;
            if (bPartial && best.course) {
              const hIdx = best.handicap_index_used ?? best.user?.handicap_index ?? 0;
              const ph = calculatePlayingHandicap(hIdx, best.course.slope, best.course.rating, best.course.par, allowance);
              bScratch = calculateProjectedScore(best.gross_score!, best.holes_played || 0, bMax, ph, best.course.par, best.course.rating).projectedScratchOverRating;
            } else {
              bScratch = calculateScratchScore(best.gross_score!, best.course?.rating || 72, best.course?.par || 72, best.holes_played || bMax, bMax).scratchStrokesOverRating;
            }

            return sScratch < bScratch ? s : best;
          });
        }
      }

      if (bestScore) {
        const maxH = getMaxHoles(bestScore.course?.type || '18_holes');
        const isPartial = !bestScore.is_complete && (bestScore.holes_played || 0) < maxH;
        const allowance = currentSeason?.handicap_allowance ?? 95;

        let netOverPar = bestScore.net_strokes_over_par;
        let scratchOver: number | null = null;
        let displayGross = bestScore.gross_score;
        let actGross = bestScore.gross_score;
        let actNetOverPar = bestScore.net_strokes_over_par;
        let actScratchOverRating: number | null = null;

        if (isPartial && bestScore.gross_score != null && bestScore.course) {
          const hcpIdx = bestScore.handicap_index_used ?? bestScore.user?.handicap_index ?? 0;
          const fullPH = calculatePlayingHandicap(
            hcpIdx, bestScore.course.slope, bestScore.course.rating,
            bestScore.course.par, allowance
          );
          const projected = calculateProjectedScore(
            bestScore.gross_score, bestScore.holes_played || 0, maxH,
            fullPH, bestScore.course.par, bestScore.course.rating
          );
          netOverPar = projected.projectedNetOverPar;
          scratchOver = projected.projectedScratchOverRating;
          displayGross = projected.projectedGross;

          const actualNet = calculateNetScore(
            bestScore.gross_score, hcpIdx, bestScore.course.slope,
            bestScore.course.rating, bestScore.course.par,
            bestScore.holes_played || 0, maxH, allowance
          );
          actNetOverPar = actualNet.netStrokesOverPar;

          const actualScratch = calculateScratchScore(
            bestScore.gross_score, bestScore.course.rating, bestScore.course.par,
            bestScore.holes_played || 0, maxH
          );
          actScratchOverRating = actualScratch.scratchStrokesOverRating;
        } else {
          const scratchResult = bestScore.gross_score != null && bestScore.course?.rating != null
            ? calculateScratchScore(
                bestScore.gross_score, bestScore.course.rating, bestScore.course?.par || 72,
                bestScore.holes_played || maxH, maxH
              )
            : null;
          scratchOver = scratchResult?.scratchStrokesOverRating ?? null;
          actScratchOverRating = scratchOver;
        }

        entries.push({
          userId,
          playerName: bestScore.user?.full_name || bestScore.user?.email || 'Unknown',
          profilePicture: bestScore.user?.profile_picture_url || null,
          bestNetOverPar: netOverPar,
          bestGrossScore: displayGross,
          grossOverPar: displayGross && bestScore.course?.par
            ? displayGross - bestScore.course.par
            : null,
          scratchOverRating: scratchOver,
          actualGross: actGross,
          actualNetOverPar: actNetOverPar,
          actualScratchOverRating: actScratchOverRating,
          holesPlayed: bestScore.holes_played,
          maxHoles: maxH,
          courseName: bestScore.course?.course_name || '',
          teeName: bestScore.course?.tee_name || '',
          isComplete: bestScore.is_complete,
          projectedPoints: 0,
        });
      }
    }

    // Sort by actual net/scratch scores so partial rounds rank by their current score
    if (scoringMode === 'net') {
      entries.sort((a, b) => {
        const aNet = a.actualNetOverPar ?? a.bestNetOverPar ?? 999;
        const bNet = b.actualNetOverPar ?? b.bestNetOverPar ?? 999;
        const diff = aNet - bNet;
        if (diff !== 0) return diff;
        // Tiebreaker 1: more holes played wins (completed rounds beat partial at same score)
        const holesDiff = (b.holesPlayed ?? 0) - (a.holesPlayed ?? 0);
        if (holesDiff !== 0) return holesDiff;
        // Tiebreaker 2: lower handicap wins
        const aHcpApprox = (a.actualGross ?? 999) - aNet;
        const bHcpApprox = (b.actualGross ?? 999) - bNet;
        return aHcpApprox - bHcpApprox;
      });
    } else {
      entries.sort((a, b) => {
        const aScratch = a.actualScratchOverRating ?? a.scratchOverRating ?? 999;
        const bScratch = b.actualScratchOverRating ?? b.scratchOverRating ?? 999;
        const diff = aScratch - bScratch;
        if (diff !== 0) return diff;
        return (b.holesPlayed ?? 0) - (a.holesPlayed ?? 0);
      });
    }

    // Calculate projected points with tie splitting per PRD
    const getDisplayScore = (e: LeaderboardEntry) =>
      scoringMode === 'net'
        ? (e.actualNetOverPar ?? e.bestNetOverPar)
        : (e.actualScratchOverRating ?? e.scratchOverRating);

    const scoredEntries = entries.filter((e) => getDisplayScore(e) != null);
    const numParticipants = scoredEntries.length;

    let i = 0;
    while (i < scoredEntries.length) {
      const currentScore = getDisplayScore(scoredEntries[i]);

      let j = i;
      while (j < scoredEntries.length && getDisplayScore(scoredEntries[j]) === currentScore) {
        j++;
      }

      const numTied = j - i;
      if (numTied > 1) {
        const tiedPoints: number[] = [];
        for (let k = i; k < j; k++) {
          tiedPoints.push(
            currentEvent.is_major
              ? calculateMajorEventPoints(numParticipants, k + 1)
              : calculateRegularEventPoints(numParticipants, k + 1)
          );
        }
        const splitPts = splitTiedPoints(tiedPoints, numTied);
        for (let k = i; k < j; k++) {
          scoredEntries[k].projectedPoints = splitPts;
        }
      } else {
        scoredEntries[i].projectedPoints = currentEvent.is_major
          ? calculateMajorEventPoints(numParticipants, i + 1)
          : calculateRegularEventPoints(numParticipants, i + 1);
      }
      i = j;
    }

    return entries;
  }, [eventScores, currentEvent, currentSeason, scoringMode]);

  // Build season standings
  const seasonStandings = useMemo((): SeasonStanding[] => {
    if (allSeasonScores.length === 0 || seasonEvents.length === 0) return [];

    // For each event, rank players and award points
    const pointsMap: Record<string, { totalPoints: number; eventsPlayed: number; name: string; profilePicture: string | null }> = {};

    for (const event of seasonEvents) {
      // For scratch: include ALL events (regular + playoff). Per PRD: "The scratch competition
      // runs for the entire length of the season (including playoff events)."
      // For net: only include regular season events (playoffs are bracket-based, not points)
      if (scoringMode === 'net' && event.is_playoff) continue;

      const eventScoresForEvent = allSeasonScores.filter(
        (s) => s.event_id === event.id && (s.is_complete || s.gross_score != null)
      );

      // Group by user, find best score
      const byUser: Record<string, Score> = {};
      for (const score of eventScoresForEvent) {
        const existing = byUser[score.user_id];
        if (scoringMode === 'net') {
          const sNop = score.net_strokes_over_par ?? 999;
          const eNop = existing?.net_strokes_over_par ?? 999;
          if (!existing || sNop < eNop || (sNop === eNop && score.points_awarded != null && existing.points_awarded == null)) {
            byUser[score.user_id] = score;
          }
        } else {
          // Scratch: compare by gross strokes over course rating
          const sMax = getMaxHoles(score.course?.type || '18_holes');
          const scoreDiff = score.gross_score != null
            ? calculateScratchScore(score.gross_score, score.course?.rating || 72, score.course?.par || 72, score.holes_played || sMax, sMax).scratchStrokesOverRating
            : 999;
          const eMax = existing ? getMaxHoles(existing.course?.type || '18_holes') : 18;
          const existingDiff = existing?.gross_score != null
            ? calculateScratchScore(existing.gross_score, existing.course?.rating || 72, existing.course?.par || 72, existing.holes_played || eMax, eMax).scratchStrokesOverRating
            : 999;
          if (!existing || scoreDiff < existingDiff) {
            byUser[score.user_id] = score;
          }
        }
      }

      // Sort and assign points with tie splitting
      const ranked = Object.entries(byUser).sort(([, a], [, b]) => {
        if (scoringMode === 'net') {
          return (a.net_strokes_over_par ?? 999) - (b.net_strokes_over_par ?? 999);
        }
        // Scratch: sort by gross strokes over course rating
        const aMax = getMaxHoles(a.course?.type || '18_holes');
        const bMax = getMaxHoles(b.course?.type || '18_holes');
        const aScratch = a.gross_score != null
          ? calculateScratchScore(a.gross_score, a.course?.rating || 72, a.course?.par || 72, a.holes_played || aMax, aMax).scratchStrokesOverRating
          : 999;
        const bScratch = b.gross_score != null
          ? calculateScratchScore(b.gross_score, b.course?.rating || 72, b.course?.par || 72, b.holes_played || bMax, bMax).scratchStrokesOverRating
          : 999;
        return aScratch - bScratch;
      });

      const numParticipants = ranked.length;

      // Walk through ranked list, grouping ties and splitting points
      let ri = 0;
      while (ri < ranked.length) {
        const [, refScore] = ranked[ri];
        const refMax = getMaxHoles(refScore.course?.type || '18_holes');
        const refVal = scoringMode === 'net'
          ? (refScore.net_strokes_over_par ?? 999)
          : (refScore.gross_score != null
            ? calculateScratchScore(refScore.gross_score, refScore.course?.rating || 72, refScore.course?.par || 72, refScore.holes_played || refMax, refMax).scratchStrokesOverRating
            : 999);

        let rj = ri;
        while (rj < ranked.length) {
          const [, s] = ranked[rj];
          const sMax = getMaxHoles(s.course?.type || '18_holes');
          const val = scoringMode === 'net'
            ? (s.net_strokes_over_par ?? 999)
            : (s.gross_score != null
              ? calculateScratchScore(s.gross_score, s.course?.rating || 72, s.course?.par || 72, s.holes_played || sMax, sMax).scratchStrokesOverRating
              : 999);
          if (val !== refVal) break;
          rj++;
        }

        const numTied = rj - ri;
        let assignedPoints: number;

        // For scratch: the final event of the season is a Major per PRD
        const isLastEvent = event.event_number === Math.max(...seasonEvents.map(e => e.event_number));
        const isMajorForMode = scoringMode === 'scratch'
          ? (event.is_major || isLastEvent)  // Final event = Major for scratch
          : event.is_major;

        if (numTied > 1) {
          const tiedPts: number[] = [];
          for (let k = ri; k < rj; k++) {
            tiedPts.push(
              isMajorForMode
                ? calculateMajorEventPoints(numParticipants, k + 1)
                : calculateRegularEventPoints(numParticipants, k + 1)
            );
          }
          assignedPoints = splitTiedPoints(tiedPts, numTied);
        } else {
          assignedPoints = isMajorForMode
            ? calculateMajorEventPoints(numParticipants, ri + 1)
            : calculateRegularEventPoints(numParticipants, ri + 1);
        }

        for (let k = ri; k < rj; k++) {
          const [userId, score] = ranked[k];
          if (!pointsMap[userId]) {
            pointsMap[userId] = {
              totalPoints: 0,
              eventsPlayed: 0,
              name: score.user?.full_name || score.user?.email || 'Unknown',
              profilePicture: score.user?.profile_picture_url || null,
            };
          }
          pointsMap[userId].totalPoints += assignedPoints;
          pointsMap[userId].eventsPlayed += 1;
        }

        ri = rj;
      }
    }

    // Count total scores per user for tiebreaking
    const scoresPerUser: Record<string, number> = {};
    const handicapPerUser: Record<string, number> = {};
    for (const s of allSeasonScores) {
      scoresPerUser[s.user_id] = (scoresPerUser[s.user_id] || 0) + 1;
      // Track handicap from user data if available
      if (s.user?.handicap_index != null) {
        handicapPerUser[s.user_id] = s.user.handicap_index;
      }
    }

    return Object.entries(pointsMap)
      .map(([userId, data]) => ({
        userId,
        playerName: data.name,
        profilePicture: data.profilePicture,
        totalPoints: Math.round(data.totalPoints * 10) / 10,
        eventsPlayed: data.eventsPlayed,
      }))
      .sort((a, b) => {
        // Primary: more points wins
        const pointsDiff = b.totalPoints - a.totalPoints;
        if (pointsDiff !== 0) return pointsDiff;
        // Tiebreaker 1: lower handicap wins
        const aHcp = handicapPerUser[a.userId] ?? 999;
        const bHcp = handicapPerUser[b.userId] ?? 999;
        if (aHcp !== bHcp) return aHcp - bHcp;
        // Tiebreaker 2: more events played
        const eventsDiff = b.eventsPlayed - a.eventsPlayed;
        if (eventsDiff !== 0) return eventsDiff;
        // Tiebreaker 3: more scores posted
        return (scoresPerUser[b.userId] || 0) - (scoresPerUser[a.userId] || 0);
      });
  }, [allSeasonScores, seasonEvents, scoringMode]);

  if (loading) {
    return (
      <div className="p-4 space-y-4">
        <div className="h-8 bg-[var(--bg-skeleton)] rounded-lg animate-pulse w-48" />
        <div className="h-12 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 bg-[var(--bg-skeleton)] rounded-xl animate-pulse" />
        ))}
      </div>
    );
  }

  if (isOffSeason) {
    return (
      <div className="p-4 text-center py-16">
        <AlertCircle className="w-12 h-12 text-gray-300 mx-auto mb-3" />
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">Off Season</h2>
        <p className="text-sm text-[var(--text-muted)] mt-1">Leaderboards are hidden during the off-season. Check back when the season starts!</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Leaderboard</h1>
        <div className="flex gap-1.5">
          <button
            onClick={() => {
              if (view === 'event') {
                downloadCSV(
                  eventLeaderboard.map((e, i) => ({
                    Rank: i + 1,
                    Player: e.playerName,
                    Score: e.bestNetOverPar ?? '',
                    Gross: e.bestGrossScore ?? '',
                    Points: e.projectedPoints,
                    Course: e.courseName,
                    Holes: e.holesPlayed,
                  })),
                  `leaderboard-event-${currentEvent?.event_number || 'current'}`
                );
              } else {
                downloadCSV(
                  seasonStandings.map((e, i) => ({
                    Rank: i + 1,
                    Player: e.playerName,
                    Points: e.totalPoints,
                    Events: e.eventsPlayed,
                  })),
                  `leaderboard-season-${currentSeason?.year || 'current'}`
                );
              }
            }}
            className="p-2 text-[var(--text-faint)] hover:text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] rounded-lg transition-colors"
            title="Export CSV"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* View Toggle */}
      <div className="flex bg-[var(--bg-subtle)] rounded-xl p-1">
        <button
          onClick={() => setView('event')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            view === 'event' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]' : 'text-[var(--text-muted)]'
          }`}
        >
          Current Event
        </button>
        <button
          onClick={() => setView('season')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            view === 'season' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]' : 'text-[var(--text-muted)]'
          }`}
        >
          Season Standings
        </button>
      </div>

      {/* Scoring Mode Toggle */}
      <div className="flex bg-[var(--bg-subtle)] rounded-xl p-1">
        <button
          onClick={() => setScoringMode('net')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            scoringMode === 'net' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]' : 'text-[var(--text-muted)]'
          }`}
        >
          Net
        </button>
        <button
          onClick={() => setScoringMode('scratch')}
          className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${
            scoringMode === 'scratch' ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-[var(--shadow-sm)]' : 'text-[var(--text-muted)]'
          }`}
        >
          Scratch
        </button>
      </div>

      {/* Event Leaderboard */}
      {view === 'event' && (
        <>
          {currentEvent ? (
            <div className="bg-minerva-50 rounded-xl p-3 mb-2">
              <p className="text-sm font-medium text-minerva-800">
                {currentEvent.name || `Event ${currentEvent.event_number}`}
                {currentEvent.is_major && ' (Major)'}
              </p>
              <p className="text-xs text-minerva-600">
                {currentEvent.holes} holes &middot;{' '}
                {new Date(currentEvent.start_date).toLocaleDateString()} &ndash;{' '}
                {new Date(currentEvent.end_date).toLocaleDateString()}
              </p>
            </div>
          ) : (
            <div className="bg-[var(--bg-subtle)] rounded-xl p-3">
              <p className="text-sm text-[var(--text-muted)]">No active event.</p>
            </div>
          )}

          {eventLeaderboard.length === 0 ? (
            <div className="text-center py-8">
              <Trophy className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-[var(--text-muted)] text-sm">No scores yet for this event.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {eventLeaderboard.map((entry, idx) => {
                const isCurrentUser = entry.userId === profile?.id;
                return (
                  <div
                    key={entry.userId}
                    className={`flex items-center gap-3 bg-[var(--bg-card)] rounded-xl p-3 border ${
                      isCurrentUser ? 'border-minerva-200 bg-minerva-50/30' : 'border-[var(--border-light)]'
                    } shadow-[var(--shadow-sm)]`}
                  >
                    {/* Position */}
                    <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                      {idx === 0 ? (
                        <Medal className="w-6 h-6 text-yellow-500" />
                      ) : idx === 1 ? (
                        <Medal className="w-6 h-6 text-[var(--text-faint)]" />
                      ) : idx === 2 ? (
                        <Medal className="w-6 h-6 text-amber-700" />
                      ) : (
                        <span className="text-sm font-bold text-[var(--text-faint)]">{idx + 1}</span>
                      )}
                    </div>

                    {/* Avatar */}
                    {entry.profilePicture ? (
                      <img
                        src={entry.profilePicture}
                        alt={entry.playerName}
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[var(--bg-skeleton)] flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-[var(--text-muted)]">
                          {entry.playerName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}

                    {/* Player Info */}
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className={`text-sm font-medium truncate ${isCurrentUser ? 'text-minerva-800' : 'text-[var(--text-primary)]'}`}>
                        {entry.playerName}
                        {isCurrentUser && <span className="text-xs text-minerva-600 ml-1">(you)</span>}
                      </p>
                      <p className="text-xs text-[var(--text-muted)] truncate">
                        {entry.courseName} &middot; {entry.teeName}
                      </p>
                      <p className="text-xs text-[var(--text-faint)]">
                        {entry.actualGross ?? '-'} ({(() => {
                          const val = scoringMode === 'net' ? entry.actualNetOverPar : entry.actualScratchOverRating;
                          return val != null ? formatNetScore(val) : '-';
                        })()}) | Thru {entry.isComplete ? 'F' : entry.holesPlayed}
                        {!entry.isComplete && entry.bestGrossScore != null && entry.actualGross !== entry.bestGrossScore && (
                          <span className="text-[10px] text-[var(--text-muted)] opacity-80">
                            {' - '}Projected: {entry.bestGrossScore} ({(() => {
                              const val = scoringMode === 'net' ? entry.bestNetOverPar : entry.scratchOverRating;
                              return val != null ? formatNetScore(val) : '-';
                            })()})
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Score & Points */}
                    <div className="text-right flex-shrink-0">
                      {(() => {
                        const displayNet = scoringMode === 'net'
                          ? (entry.isComplete ? entry.bestNetOverPar : entry.actualNetOverPar) ?? entry.bestNetOverPar
                          : (entry.isComplete ? entry.scratchOverRating : entry.actualScratchOverRating) ?? entry.scratchOverRating;
                        return (
                          <p className={`text-lg font-bold ${
                            displayNet != null
                              ? (displayNet < 0 ? 'text-red-600' : displayNet === 0 ? 'text-green-600' : 'text-[var(--text-primary)]')
                              : 'text-[var(--text-faint)]'
                          }`}>
                            {displayNet != null ? formatNetScore(displayNet) : '-'}
                          </p>
                        );
                      })()}
                      {entry.projectedPoints > 0 && (
                        <p className="text-xs text-yellow-600 font-medium">
                          {entry.projectedPoints} pts
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* Season Standings */}
      {view === 'season' && (
        <>
          <div className="bg-purple-50 rounded-xl p-3 mb-2">
            <p className="text-sm font-medium text-purple-800">
              {currentSeason?.year} Season — {scoringMode === 'net' ? 'Net' : 'Scratch'} Champion Race
            </p>
            <p className="text-xs text-purple-600">
              {seasonEvents.length} events &middot;{' '}
              {currentSeason?.mode.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
            </p>
          </div>

          {seasonStandings.length === 0 ? (
            <div className="text-center py-8">
              <TrendingUp className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-[var(--text-muted)] text-sm">No season data yet.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {seasonStandings.map((entry, idx) => {
                const isCurrentUser = entry.userId === profile?.id;
                return (
                  <div
                    key={entry.userId}
                    className={`flex items-center gap-3 bg-[var(--bg-card)] rounded-xl p-3 border ${
                      isCurrentUser ? 'border-minerva-200 bg-minerva-50/30' : 'border-[var(--border-light)]'
                    } shadow-[var(--shadow-sm)]`}
                  >
                    <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                      {idx === 0 ? (
                        <Medal className="w-6 h-6 text-yellow-500" />
                      ) : idx === 1 ? (
                        <Medal className="w-6 h-6 text-[var(--text-faint)]" />
                      ) : idx === 2 ? (
                        <Medal className="w-6 h-6 text-amber-700" />
                      ) : (
                        <span className="text-sm font-bold text-[var(--text-faint)]">{idx + 1}</span>
                      )}
                    </div>

                    {/* Avatar */}
                    {entry.profilePicture ? (
                      <img
                        src={entry.profilePicture}
                        alt={entry.playerName}
                        className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-[var(--bg-skeleton)] flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-bold text-[var(--text-muted)]">
                          {entry.playerName.charAt(0).toUpperCase()}
                        </span>
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${isCurrentUser ? 'text-minerva-800' : 'text-[var(--text-primary)]'}`}>
                        {entry.playerName}
                        {isCurrentUser && <span className="text-xs text-minerva-600 ml-1">(you)</span>}
                      </p>
                      <p className="text-xs text-[var(--text-muted)]">
                        {entry.eventsPlayed} event{entry.eventsPlayed !== 1 ? 's' : ''} played
                      </p>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-bold text-[var(--text-primary)]">{entry.totalPoints}</p>
                      <p className="text-xs text-[var(--text-faint)]">pts</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
