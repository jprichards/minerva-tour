/**
 * Shared standings computation — extracted from leaderboard page for reuse
 * by the event recap feature. Pure functions, no React dependencies.
 */

import {
  calculateRegularEventPoints,
  calculateMajorEventPoints,
  splitTiedPoints,
  calculateScratchScore,
  calculatePlayingHandicap,
  calculateProjectedScore,
  calculateNetScore,
  getMaxHoles,
} from '@/lib/scoring';
import type { Score, Event, Season } from '@/types/database';

export type ScoringMode = 'net' | 'scratch';

export interface LeaderboardEntry {
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

export interface SeasonStanding {
  userId: string;
  playerName: string;
  profilePicture: string | null;
  totalPoints: number;
  eventsPlayed: number;
}

/**
 * Compute the event leaderboard from raw scores.
 * Returns ranked entries with projected points assigned (including tie splitting).
 */
export function computeEventLeaderboard(
  eventScores: Score[],
  currentEvent: Event,
  currentSeason: Season | null,
  scoringMode: ScoringMode
): LeaderboardEntry[] {
  if (eventScores.length === 0) return [];

  const today = new Date().toISOString().split('T')[0];
  const eventEnded = currentEvent.end_date < today;
  const eligibleScores = eventEnded
    ? eventScores.filter((s) => s.is_complete)
    : eventScores.filter((s) => s.is_complete || s.gross_score != null);

  if (eligibleScores.length === 0) return [];

  const byUser: Record<string, Score[]> = {};
  for (const score of eligibleScores) {
    if (!byUser[score.user_id]) byUser[score.user_id] = [];
    byUser[score.user_id].push(score);
  }

  const entries: LeaderboardEntry[] = [];
  for (const [userId, scores] of Object.entries(byUser)) {
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

  // Sort entries
  if (scoringMode === 'net') {
    entries.sort((a, b) => {
      const aNet = a.actualNetOverPar ?? a.bestNetOverPar ?? 999;
      const bNet = b.actualNetOverPar ?? b.bestNetOverPar ?? 999;
      const diff = aNet - bNet;
      if (diff !== 0) return diff;
      const holesDiff = (b.holesPlayed ?? 0) - (a.holesPlayed ?? 0);
      if (holesDiff !== 0) return holesDiff;
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

  // Assign projected points with tie splitting
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
      const splitPts = Math.round(splitTiedPoints(tiedPoints, numTied) * 10) / 10;
      for (let k = i; k < j; k++) {
        scoredEntries[k].projectedPoints = splitPts;
      }
    } else {
      const pts = currentEvent.is_major
        ? calculateMajorEventPoints(numParticipants, i + 1)
        : calculateRegularEventPoints(numParticipants, i + 1);
      scoredEntries[i].projectedPoints = Math.round(pts * 10) / 10;
    }
    i = j;
  }

  return entries;
}

/**
 * Compute season standings across all events.
 * Pass throughEventNumber to limit to events <= that number (for historical recaps).
 */
export function computeSeasonStandings(
  allSeasonScores: Score[],
  seasonEvents: Event[],
  scoringMode: ScoringMode,
  throughEventNumber?: number
): SeasonStanding[] {
  if (allSeasonScores.length === 0 || seasonEvents.length === 0) return [];

  const eventsToInclude = throughEventNumber != null
    ? seasonEvents.filter((e) => e.event_number <= throughEventNumber)
    : seasonEvents;

  const pointsMap: Record<string, { totalPoints: number; eventsPlayed: number; name: string; profilePicture: string | null }> = {};

  for (const event of eventsToInclude) {
    if (scoringMode === 'net' && event.is_playoff) continue;

    const eventScoresForEvent = allSeasonScores.filter(
      (s) => s.event_id === event.id && (s.is_complete || s.gross_score != null)
    );

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

    const ranked = Object.entries(byUser).sort(([, a], [, b]) => {
      if (scoringMode === 'net') {
        return (a.net_strokes_over_par ?? 999) - (b.net_strokes_over_par ?? 999);
      }
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

      const isMajorForMode = event.is_major;

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

  const scoresPerUser: Record<string, number> = {};
  const handicapPerUser: Record<string, number> = {};
  for (const s of allSeasonScores) {
    scoresPerUser[s.user_id] = (scoresPerUser[s.user_id] || 0) + 1;
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
      const pointsDiff = b.totalPoints - a.totalPoints;
      if (pointsDiff !== 0) return pointsDiff;
      const aHcp = handicapPerUser[a.userId] ?? 999;
      const bHcp = handicapPerUser[b.userId] ?? 999;
      if (aHcp !== bHcp) return aHcp - bHcp;
      const eventsDiff = b.eventsPlayed - a.eventsPlayed;
      if (eventsDiff !== 0) return eventsDiff;
      return (scoresPerUser[b.userId] || 0) - (scoresPerUser[a.userId] || 0);
    });
}
