/**
 * Minerva Tour Scoring Calculations (WHS formula)
 *
 * Unrounded Course Handicap = (Handicap Index × Slope / 113) + (Rating − Par)
 * Playing Handicap = round(Allowance/100 × Unrounded Course Handicap)
 * Net Strokes Over Par = Gross Score − Playing Handicap − Par
 *
 * For partial rounds:
 *   Partial Playing Handicap = round(Full Playing Handicap × Holes Played / Max Holes)
 *   Partial Par = Full Par × (Holes Played / Max Holes), rounded
 *   Net = Gross − Partial Playing Handicap
 *   Net to Par = round(Net − Partial Par)
 */

/**
 * WHS Course Handicap = round((Index × Slope / 113) + (Rating − Par))
 */
export function calculateCourseHandicap(
  handicapIndex: number,
  slope: number,
  rating: number,
  par: number
): number {
  return Math.round((handicapIndex * slope) / 113 + (rating - par));
}

/**
 * Calculate the WHS Playing Handicap with course difficulty adjustment and handicap allowance.
 * Playing Handicap = round((Index * Slope / 113 + (Rating - Par)) * allowance / 100)
 */
export function calculatePlayingHandicap(
  handicapIndex: number,
  slope: number,
  rating: number,
  par: number,
  allowance: number = 100
): number {
  return Math.round(((handicapIndex * slope) / 113 + (rating - par)) * allowance / 100);
}

/**
 * Calculate partial course handicap for partial rounds
 */
export function calculatePartialCourseHandicap(
  fullCourseHandicap: number,
  holesPlayed: number,
  maxHoles: number
): number {
  return Math.round(fullCourseHandicap * (holesPlayed / maxHoles));
}

/**
 * Calculate partial par for partial rounds
 */
export function calculatePartialPar(fullPar: number, holesPlayed: number, maxHoles: number): number {
  return Math.round(fullPar * (holesPlayed / maxHoles));
}

/**
 * Check if a course type is compatible with the active event's hole count.
 * 18h/36h events → only 18_holes courses; 9h events → only 9_holes/front_9/back_9.
 * Returns true (no filtering) when eventHoles is null/undefined.
 */
export function courseMatchesEventHoles(courseType: string, eventHoles: number | null | undefined): boolean {
  if (eventHoles == null) return true;
  if (eventHoles === 18 || eventHoles === 36) return courseType === '18_holes';
  if (eventHoles === 9) return courseType !== '18_holes';
  return true;
}

/**
 * Get the max holes for a course type
 */
export function getMaxHoles(courseType: string): number {
  switch (courseType) {
    case '18_holes':
      return 18;
    case '9_holes':
    case 'front_9':
    case 'back_9':
      return 9;
    default:
      return 18;
  }
}

/**
 * Calculate net score using the WHS Playing Handicap with allowance.
 *
 * The returned `courseHandicap` is the playing handicap (strokes given),
 * which is what gets stored in scores.course_handicap.
 */
export function calculateNetScore(
  grossScore: number,
  handicapIndex: number,
  slope: number,
  rating: number,
  par: number,
  holesPlayed: number,
  maxHoles: number,
  allowance: number = 95
): {
  courseHandicap: number;
  netScore: number;
  netStrokesOverPar: number;
  isPartial: boolean;
} {
  const fullPlayingHandicap = calculatePlayingHandicap(handicapIndex, slope, rating, par, allowance);
  const isPartial = holesPlayed < maxHoles;

  if (isPartial) {
    const partialHandicap = calculatePartialCourseHandicap(fullPlayingHandicap, holesPlayed, maxHoles);
    const partialPar = calculatePartialPar(par, holesPlayed, maxHoles);
    const netScore = grossScore - partialHandicap;
    const netStrokesOverPar = Math.round(netScore - partialPar);

    return {
      courseHandicap: partialHandicap,
      netScore,
      netStrokesOverPar,
      isPartial: true,
    };
  }

  const netScore = grossScore - fullPlayingHandicap;
  const netStrokesOverPar = grossScore - fullPlayingHandicap - par;

  return {
    courseHandicap: fullPlayingHandicap,
    netScore,
    netStrokesOverPar,
    isPartial: false,
  };
}

/**
 * Project a partial round to a full-round equivalent using Glide's pace-based formula.
 *
 * Glide Col N: ProjectedGross = round(OverPar + (PH / MaxHoles) * RemainingHoles + Par)
 * Glide Col Q: ProjectedNetOverPar = round(ProjectedGross − PH) − Par
 *
 * For complete rounds (holesPlayed >= maxHoles), returns actual values with no projection.
 */
export function calculateProjectedScore(
  grossScore: number,
  holesPlayed: number,
  maxHoles: number,
  playingHandicap: number,
  par: number,
  rating: number
): {
  projectedGross: number;
  projectedNetOverPar: number;
  projectedScratchOverRating: number;
} {
  if (holesPlayed >= maxHoles || holesPlayed <= 0) {
    return {
      projectedGross: grossScore,
      projectedNetOverPar: grossScore - playingHandicap - par,
      projectedScratchOverRating: Math.round(grossScore - rating),
    };
  }

  const partialPar = Math.round(par * holesPlayed / maxHoles);
  const overPar = grossScore - partialPar;
  const remainingHoles = maxHoles - holesPlayed;

  const projectedGross = Math.round(
    overPar + (playingHandicap / maxHoles) * remainingHoles + par
  );

  return {
    projectedGross,
    projectedNetOverPar: Math.round(projectedGross - playingHandicap) - par,
    projectedScratchOverRating: Math.round(projectedGross - rating),
  };
}

/**
 * Calculate scratch score (gross score relative to course rating, no handicap)
 * Scratch Strokes Over Rating = Gross Score − Course Rating (rounded)
 * For partial rounds, use proportional rating
 */
export function calculateScratchScore(
  grossScore: number,
  rating: number,
  par: number,
  holesPlayed: number,
  maxHoles: number
): {
  scratchStrokesOverRating: number;
  isPartial: boolean;
} {
  const isPartial = holesPlayed < maxHoles;

  if (isPartial) {
    const partialRating = rating * (holesPlayed / maxHoles);
    return {
      scratchStrokesOverRating: Math.round(grossScore - partialRating),
      isPartial: true,
    };
  }

  return {
    scratchStrokesOverRating: Math.round(grossScore - rating),
    isPartial: false,
  };
}

/**
 * Calculate point payouts for a regular event
 * Winner gets 1 point per participant, subsequent places get one less
 */
export function calculateRegularEventPoints(
  numParticipants: number,
  place: number
): number {
  if (numParticipants === 0 || place < 1 || place > numParticipants) return 0;
  return Math.max(numParticipants - place + 1, 0);
}

/**
 * Calculate point payouts for a major event
 * 1st: Max of (participants * 1.33) or 10
 * 2nd: 1st - 3
 * 3rd: 2nd - 2
 * 4th: 3rd - 1
 * 5th: 4th - 1
 * 6th: 5th - 1
 * 7th+: 1 less per place (minimum 1)
 */
export function calculateMajorEventPoints(
  numParticipants: number,
  place: number
): number {
  if (numParticipants === 0 || place < 1 || place > numParticipants) return 0;

  const firstPlacePoints = Math.max(
    Math.round(numParticipants * 1.33 * 10) / 10, // round to nearest tenth
    10
  );

  if (place === 1) return firstPlacePoints;

  // Calculate points for each place
  const points: number[] = [firstPlacePoints];

  // 2nd: 1st - 3
  points.push(points[0] - 3);
  // 3rd: 2nd - 2
  points.push(points[1] - 2);
  // 4th: 3rd - 1
  points.push(points[2] - 1);
  // 5th: 4th - 1
  points.push(points[3] - 1);
  // 6th: 5th - 1
  points.push(points[4] - 1);

  // 7th and beyond: 1 less per place (minimum 1)
  for (let i = 6; i < numParticipants; i++) {
    points.push(Math.max(points[i - 1] - 1, 1));
  }

  return Math.max(points[place - 1] ?? 1, 1);
}

/**
 * Handle tied scores - split points evenly and round to nearest tenth
 */
export function splitTiedPoints(points: number[], numTied: number): number {
  const totalPoints = points.reduce((sum, p) => sum + p, 0);
  return Math.round((totalPoints / numTied) * 10) / 10;
}

/**
 * Calculate projected points for a player within an event.
 *
 * Given a player's score and all completed best-per-user scores in the event,
 * determines the player's rank (with tie handling) and returns projected
 * net and scratch points.
 *
 * Only completed scores count toward the participant pool. An in-progress
 * player is ranked as if their current score were final.
 */
export function calculateProjectedPoints(
  playerNetOverPar: number | null,
  playerScratchOverRating: number | null,
  allBestNetScores: number[],
  allBestScratchScores: number[],
  isMajor: boolean
): { netPoints: number | null; scratchPoints: number | null } {
  const calcPoints = (
    playerScore: number | null,
    allScores: number[]
  ): number | null => {
    if (playerScore == null || allScores.length === 0) return null;

    const sorted = [...allScores].sort((a, b) => a - b);
    const numParticipants = sorted.length;

    // Find the rank group this player falls into
    let rankStart = 0;
    while (rankStart < sorted.length && sorted[rankStart] < playerScore) {
      rankStart++;
    }
    let rankEnd = rankStart;
    while (rankEnd < sorted.length && sorted[rankEnd] === playerScore) {
      rankEnd++;
    }

    const numTied = rankEnd - rankStart;
    if (numTied <= 0) {
      // Player's score isn't in the list (shouldn't happen if caller includes it)
      // Treat as last place
      const place = numParticipants;
      return isMajor
        ? calculateMajorEventPoints(numParticipants, place)
        : calculateRegularEventPoints(numParticipants, place);
    }

    if (numTied > 1) {
      const tiedPoints: number[] = [];
      for (let k = rankStart; k < rankEnd; k++) {
        tiedPoints.push(
          isMajor
            ? calculateMajorEventPoints(numParticipants, k + 1)
            : calculateRegularEventPoints(numParticipants, k + 1)
        );
      }
      return splitTiedPoints(tiedPoints, numTied);
    }

    const place = rankStart + 1;
    return isMajor
      ? calculateMajorEventPoints(numParticipants, place)
      : calculateRegularEventPoints(numParticipants, place);
  };

  return {
    netPoints: calcPoints(playerNetOverPar, allBestNetScores),
    scratchPoints: calcPoints(playerScratchOverRating, allBestScratchScores),
  };
}

/**
 * Unrounded WHS course handicap: (Index × Slope / 113) + (Rating − Par)
 */
export function calculateUnroundedCourseHandicap(
  handicapIndex: number,
  slope: number,
  rating: number,
  par: number
): number {
  return (handicapIndex * slope) / 113 + (rating - par);
}

/**
 * Unrounded playing handicap: unrounded course handicap × (allowance / 100)
 */
export function calculateUnroundedPlayingHandicap(
  handicapIndex: number,
  slope: number,
  rating: number,
  par: number,
  allowance: number = 100
): number {
  return calculateUnroundedCourseHandicap(handicapIndex, slope, rating, par) * (allowance / 100);
}

/**
 * USGA Scoring Differential: (113 / Slope) × (Gross Score − Course Rating)
 * Used by GHIN to calculate handicap index updates.
 */
export function calculateScoringDifferential(
  grossScore: number,
  rating: number,
  slope: number
): number {
  return (113 / slope) * (grossScore - rating);
}

/**
 * Format net score for display (e.g. +3, -2, E for even)
 */
export function formatNetScore(netStrokesOverPar: number): string {
  if (netStrokesOverPar === 0) return 'E';
  if (netStrokesOverPar > 0) return `+${netStrokesOverPar}`;
  return `${netStrokesOverPar}`;
}

/**
 * Format gross score for display
 */
export function formatGrossScore(grossScore: number, par: number): string {
  const diff = grossScore - par;
  if (diff === 0) return `${grossScore} (E)`;
  if (diff > 0) return `${grossScore} (+${diff})`;
  return `${grossScore} (${diff})`;
}
