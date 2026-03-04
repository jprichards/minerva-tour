import { describe, it, expect } from 'vitest';
import {
  calculateCourseHandicap,
  calculatePartialCourseHandicap,
  calculatePartialPar,
  getMaxHoles,
  courseMatchesEventHoles,
  calculateNetScore,
  calculateScratchScore,
  calculateProjectedScore,
  calculateRegularEventPoints,
  calculateMajorEventPoints,
  splitTiedPoints,
  calculateProjectedPoints,
  formatNetScore,
  formatGrossScore,
} from '@/lib/scoring';

// ============================================
// calculateCourseHandicap
// ============================================
describe('calculateCourseHandicap', () => {
  it('calculates correctly for a standard index and slope', () => {
    // Handicap 15.0, Slope 113 → 15 (exactly 113/113)
    expect(calculateCourseHandicap(15.0, 113)).toBe(15);
  });

  it('calculates for a high slope course', () => {
    // Handicap 10.0, Slope 140 → round(10 * 140 / 113) = round(12.389) = 12
    expect(calculateCourseHandicap(10.0, 140)).toBe(12);
  });

  it('calculates for a low slope course', () => {
    // Handicap 10.0, Slope 90 → round(10 * 90 / 113) = round(7.964) = 8
    expect(calculateCourseHandicap(10.0, 90)).toBe(8);
  });

  it('returns 0 for a 0 handicap index', () => {
    expect(calculateCourseHandicap(0, 130)).toBe(0);
  });

  it('handles plus handicap (negative index)', () => {
    // +2.0 handicap, Slope 120 → round(-2 * 120 / 113) = round(-2.123) = -2
    expect(calculateCourseHandicap(-2.0, 120)).toBe(-2);
  });

  it('rounds to nearest integer (0.5 rounds up)', () => {
    // Handicap 5.0, Slope 128 → round(5 * 128 / 113) = round(5.664) = 6
    expect(calculateCourseHandicap(5.0, 128)).toBe(6);
  });

  it('rounds down when below 0.5', () => {
    // Handicap 5.0, Slope 115 → round(5 * 115 / 113) = round(5.088) = 5
    expect(calculateCourseHandicap(5.0, 115)).toBe(5);
  });

  it('handles very high handicap', () => {
    // Handicap 36.0, Slope 155 → round(36 * 155 / 113) = round(49.38) = 49
    expect(calculateCourseHandicap(36.0, 155)).toBe(49);
  });
});

// ============================================
// calculatePartialCourseHandicap
// ============================================
describe('calculatePartialCourseHandicap', () => {
  it('calculates for 9 out of 18 holes', () => {
    // Full handicap 12, 9/18 holes → round(12 * 9/18) = round(6.0) = 6
    expect(calculatePartialCourseHandicap(12, 9, 18)).toBe(6);
  });

  it('calculates for 12 out of 18 holes', () => {
    // Full handicap 15, 12/18 holes → round(15 * 12/18) = round(10.0) = 10
    expect(calculatePartialCourseHandicap(15, 12, 18)).toBe(10);
  });

  it('calculates for 6 out of 9 holes', () => {
    // Full handicap 8, 6/9 holes → round(8 * 6/9) = round(5.333) = 5
    expect(calculatePartialCourseHandicap(8, 6, 9)).toBe(5);
  });

  it('returns full handicap when all holes played', () => {
    expect(calculatePartialCourseHandicap(10, 18, 18)).toBe(10);
  });

  it('returns 0 when 0 holes played', () => {
    expect(calculatePartialCourseHandicap(10, 0, 18)).toBe(0);
  });

  it('handles odd division with rounding', () => {
    // Full handicap 11, 7/18 → round(11 * 7/18) = round(4.278) = 4
    expect(calculatePartialCourseHandicap(11, 7, 18)).toBe(4);
  });
});

// ============================================
// calculatePartialPar
// ============================================
describe('calculatePartialPar', () => {
  it('calculates half par for 9 of 18 holes', () => {
    expect(calculatePartialPar(72, 9, 18)).toBe(36);
  });

  it('calculates partial par for 12 of 18 holes', () => {
    // 72 * 12/18 = 48.0
    expect(calculatePartialPar(72, 12, 18)).toBe(48);
  });

  it('returns full par when all holes played', () => {
    expect(calculatePartialPar(72, 18, 18)).toBe(72);
  });

  it('returns 0 when 0 holes played', () => {
    expect(calculatePartialPar(72, 0, 18)).toBe(0);
  });

  it('handles odd-par course', () => {
    // 71 * 9/18 = 35.5 → rounds to 36
    expect(calculatePartialPar(71, 9, 18)).toBe(36);
  });

  it('handles 9-hole par for partial play', () => {
    // Par 36, 5 of 9 → round(36 * 5/9) = round(20.0) = 20
    expect(calculatePartialPar(36, 5, 9)).toBe(20);
  });
});

// ============================================
// getMaxHoles
// ============================================
describe('getMaxHoles', () => {
  it('returns 18 for 18_holes', () => {
    expect(getMaxHoles('18_holes')).toBe(18);
  });

  it('returns 9 for 9_holes', () => {
    expect(getMaxHoles('9_holes')).toBe(9);
  });

  it('returns 9 for front_9', () => {
    expect(getMaxHoles('front_9')).toBe(9);
  });

  it('returns 9 for back_9', () => {
    expect(getMaxHoles('back_9')).toBe(9);
  });

  it('returns 18 for unknown course type (default)', () => {
    expect(getMaxHoles('unknown')).toBe(18);
    expect(getMaxHoles('')).toBe(18);
  });
});

// ============================================
// calculateNetScore (full integration of scoring)
// ============================================
describe('calculateNetScore', () => {
  it('calculates complete 18-hole round correctly', () => {
    // Gross 85, Handicap 10.0, Slope 130, Rating 70.5, Par 72, 18/18
    const result = calculateNetScore(85, 10.0, 130, 70.5, 72, 18, 18);
    // Course handicap = round(10 * 130 / 113) = round(11.504) = 12
    expect(result.courseHandicap).toBe(12);
    expect(result.netScore).toBe(85 - 12); // 73
    // netStrokesOverPar = round(85 - 12 - 70.5) = round(2.5) = 3
    expect(result.netStrokesOverPar).toBe(3);
    expect(result.isPartial).toBe(false);
  });

  it('calculates partial round correctly', () => {
    // Gross 45, Handicap 12.0, Slope 120, Rating 70.0, Par 72, 9/18
    const result = calculateNetScore(45, 12.0, 120, 70.0, 72, 9, 18);
    // Full course handicap = round(12 * 120 / 113) = round(12.743) = 13
    // Partial handicap = round(13 * 9/18) = round(6.5) = 7
    expect(result.courseHandicap).toBe(7);
    // Partial par = round(72 * 9/18) = 36
    // Net = 45 - 7 = 38
    expect(result.netScore).toBe(38);
    // Net strokes over par = round(38 - 36) = 2
    expect(result.netStrokesOverPar).toBe(2);
    expect(result.isPartial).toBe(true);
  });

  it('handles even par round', () => {
    // A scratch golfer on a standard course
    const result = calculateNetScore(72, 0, 113, 72.0, 72, 18, 18);
    expect(result.courseHandicap).toBe(0);
    expect(result.netScore).toBe(72);
    expect(result.netStrokesOverPar).toBe(0);
    expect(result.isPartial).toBe(false);
  });

  it('handles under-par round', () => {
    // Gross 68 on par 72 with low handicap
    const result = calculateNetScore(68, 2.0, 130, 70.0, 72, 18, 18);
    // Course handicap = round(2 * 130 / 113) = round(2.301) = 2
    expect(result.courseHandicap).toBe(2);
    // Net = 68 - 2 = 66
    expect(result.netScore).toBe(66);
    // Net over par = round(68 - 2 - 70) = round(-4) = -4
    expect(result.netStrokesOverPar).toBe(-4);
  });

  it('handles 9-hole course type (not partial)', () => {
    // 9 of 9 is not partial
    const result = calculateNetScore(42, 15.0, 120, 35.0, 36, 9, 9);
    expect(result.isPartial).toBe(false);
    // Full handicap = round(15 * 120 / 113) = round(15.929) = 16
    expect(result.courseHandicap).toBe(16);
    expect(result.netScore).toBe(42 - 16); // 26
    expect(result.netStrokesOverPar).toBe(Math.round(42 - 16 - 35)); // round(-9) = -9
  });
});

// ============================================
// calculateScratchScore
// ============================================
describe('calculateScratchScore', () => {
  it('calculates scratch strokes over rating for a complete round', () => {
    // Gross 85, Rating 70.5, Par 72, 18/18
    // Scratch = round(85 - 70.5) = round(14.5) = 15
    const result = calculateScratchScore(85, 70.5, 72, 18, 18);
    expect(result.scratchStrokesOverRating).toBe(15);
    expect(result.isPartial).toBe(false);
  });

  it('calculates scratch for an even-with-rating round', () => {
    // Gross 72, Rating 72.0 → round(72 - 72) = 0 (even)
    const result = calculateScratchScore(72, 72.0, 72, 18, 18);
    expect(result.scratchStrokesOverRating).toBe(0);
  });

  it('calculates scratch for a below-rating round', () => {
    // Gross 68, Rating 71.2 → round(68 - 71.2) = round(-3.2) = -3
    const result = calculateScratchScore(68, 71.2, 72, 18, 18);
    expect(result.scratchStrokesOverRating).toBe(-3);
  });

  it('handles non-standard rating (easy course)', () => {
    // Gross 80, Rating 67.5, Par 72
    // Scratch = round(80 - 67.5) = round(12.5) = 13
    const result = calculateScratchScore(80, 67.5, 72, 18, 18);
    expect(result.scratchStrokesOverRating).toBe(13);
  });

  it('handles 9-hole course (complete)', () => {
    // Gross 42, Rating 35.0, Par 36, 9/9
    // Scratch = round(42 - 35) = 7
    const result = calculateScratchScore(42, 35.0, 36, 9, 9);
    expect(result.scratchStrokesOverRating).toBe(7);
    expect(result.isPartial).toBe(false);
  });

  it('handles partial round with proportional rating', () => {
    // Gross 45, Rating 70.0, Par 72, 9/18
    // Partial rating = 70.0 * 9/18 = 35.0
    // Scratch = round(45 - 35) = 10
    const result = calculateScratchScore(45, 70.0, 72, 9, 18);
    expect(result.scratchStrokesOverRating).toBe(10);
    expect(result.isPartial).toBe(true);
  });

  it('normalizes scores across different courses', () => {
    // Easy course: Gross 75, Rating 68.0 → scratch = round(75 - 68) = 7
    const easy = calculateScratchScore(75, 68.0, 70, 18, 18);
    // Hard course: Gross 82, Rating 74.5 → scratch = round(82 - 74.5) = round(7.5) = 8
    const hard = calculateScratchScore(82, 74.5, 75, 18, 18);
    // The easy course score is better (7 < 8) even though gross is lower
    expect(easy.scratchStrokesOverRating).toBeLessThan(hard.scratchStrokesOverRating);
  });
});

// ============================================
// calculateRegularEventPoints
// ============================================
describe('calculateRegularEventPoints', () => {
  it('awards max points to 1st place', () => {
    expect(calculateRegularEventPoints(10, 1)).toBe(10);
  });

  it('awards descending points for subsequent places', () => {
    expect(calculateRegularEventPoints(10, 2)).toBe(9);
    expect(calculateRegularEventPoints(10, 3)).toBe(8);
    expect(calculateRegularEventPoints(10, 10)).toBe(1);
  });

  it('awards 1 point to last place', () => {
    expect(calculateRegularEventPoints(5, 5)).toBe(1);
  });

  it('returns 0 for invalid inputs', () => {
    expect(calculateRegularEventPoints(0, 1)).toBe(0);
    expect(calculateRegularEventPoints(10, 0)).toBe(0);
    expect(calculateRegularEventPoints(10, 11)).toBe(0);
    expect(calculateRegularEventPoints(10, -1)).toBe(0);
  });

  it('handles single participant', () => {
    expect(calculateRegularEventPoints(1, 1)).toBe(1);
  });

  it('handles large field', () => {
    expect(calculateRegularEventPoints(20, 1)).toBe(20);
    expect(calculateRegularEventPoints(20, 20)).toBe(1);
  });
});

// ============================================
// calculateMajorEventPoints
// ============================================
describe('calculateMajorEventPoints', () => {
  it('gives 1st place max of (n * 1.33) or 10', () => {
    // 10 participants: round(10 * 1.33 * 10) / 10 = 13.3
    expect(calculateMajorEventPoints(10, 1)).toBe(13.3);
  });

  it('uses minimum of 10 for small fields', () => {
    // 5 participants: 5 * 1.33 = 6.65, min 10 → 10
    expect(calculateMajorEventPoints(5, 1)).toBe(10);
  });

  it('awards 2nd place = 1st - 3', () => {
    // 10 participants: 1st = 13.3, 2nd = 13.3 - 3 = 10.3
    expect(calculateMajorEventPoints(10, 2)).toBe(10.3);
  });

  it('awards 3rd place = 2nd - 2', () => {
    expect(calculateMajorEventPoints(10, 3)).toBe(8.3);
  });

  it('awards 4th place = 3rd - 1', () => {
    expect(calculateMajorEventPoints(10, 4)).toBeCloseTo(7.3, 1);
  });

  it('awards 5th place = 4th - 1', () => {
    expect(calculateMajorEventPoints(10, 5)).toBeCloseTo(6.3, 1);
  });

  it('awards 6th place = 5th - 1', () => {
    expect(calculateMajorEventPoints(10, 6)).toBeCloseTo(5.3, 1);
  });

  it('awards 7th+ with 1 point decrement per place (min 1)', () => {
    expect(calculateMajorEventPoints(10, 7)).toBeCloseTo(4.3, 1);
    expect(calculateMajorEventPoints(10, 8)).toBeCloseTo(3.3, 1);
  });

  it('guarantees minimum 1 point', () => {
    // Large enough field that bottom places get min 1
    expect(calculateMajorEventPoints(20, 20)).toBeGreaterThanOrEqual(1);
  });

  it('returns 0 for invalid inputs', () => {
    expect(calculateMajorEventPoints(0, 1)).toBe(0);
    expect(calculateMajorEventPoints(10, 0)).toBe(0);
    expect(calculateMajorEventPoints(10, 11)).toBe(0);
  });
});

// ============================================
// splitTiedPoints
// ============================================
describe('splitTiedPoints', () => {
  it('splits points evenly for 2 tied players', () => {
    // Places 1st and 2nd tie: points [10, 9] → 9.5 each
    expect(splitTiedPoints([10, 9], 2)).toBe(9.5);
  });

  it('splits points for 3 tied players', () => {
    // Places 1st, 2nd, 3rd tie: [10, 9, 8] → 9.0 each
    expect(splitTiedPoints([10, 9, 8], 3)).toBe(9);
  });

  it('rounds to nearest tenth', () => {
    expect(splitTiedPoints([7, 6, 5], 3)).toBe(6);
  });

  it('handles single player (no real tie)', () => {
    expect(splitTiedPoints([10], 1)).toBe(10);
  });
});

// ============================================
// calculateProjectedPoints
// ============================================
describe('calculateProjectedPoints', () => {
  it('returns null when player score is null', () => {
    const result = calculateProjectedPoints(null, null, [1, 2, 3], [5, 6, 7], false);
    expect(result.netPoints).toBeNull();
    expect(result.scratchPoints).toBeNull();
  });

  it('returns null when score arrays are empty', () => {
    const result = calculateProjectedPoints(3, 5, [], [], false);
    expect(result.netPoints).toBeNull();
    expect(result.scratchPoints).toBeNull();
  });

  it('calculates points for a solo player (regular event)', () => {
    // 1 participant, 1st place → 1 point
    const result = calculateProjectedPoints(3, 5, [3], [5], false);
    expect(result.netPoints).toBe(1);
    expect(result.scratchPoints).toBe(1);
  });

  it('calculates points for a solo player (major event)', () => {
    // 1 participant, 1st place → 10 points (minimum for major)
    const result = calculateProjectedPoints(3, 5, [3], [5], true);
    expect(result.netPoints).toBe(10);
    expect(result.scratchPoints).toBe(10);
  });

  it('ranks player correctly among multiple scores (regular)', () => {
    // 4 participants, scores: -2, 0, 3, 5 → player at 0 is 2nd → 3 points
    const result = calculateProjectedPoints(0, null, [-2, 0, 3, 5], [], false);
    expect(result.netPoints).toBe(3);
    expect(result.scratchPoints).toBeNull();
  });

  it('ranks first place correctly (regular)', () => {
    // 5 participants, player has best score → 1st → 5 points
    const result = calculateProjectedPoints(-5, null, [-5, -2, 0, 3, 5], [], false);
    expect(result.netPoints).toBe(5);
  });

  it('ranks last place correctly (regular)', () => {
    // 4 participants, player has worst score → 4th → 1 point
    const result = calculateProjectedPoints(10, null, [-2, 0, 3, 10], [], false);
    expect(result.netPoints).toBe(1);
  });

  it('handles tied scores with point splitting (regular)', () => {
    // 4 participants: -2, 0, 0, 5
    // Two players tied at 0 share 2nd + 3rd place → (3 + 2) / 2 = 2.5
    const result = calculateProjectedPoints(0, null, [-2, 0, 0, 5], [], false);
    expect(result.netPoints).toBe(2.5);
  });

  it('handles three-way tie (regular)', () => {
    // 5 participants: -3, 1, 1, 1, 7
    // Three players tied at 1 share 2nd + 3rd + 4th → (4 + 3 + 2) / 3 = 3
    const result = calculateProjectedPoints(1, null, [-3, 1, 1, 1, 7], [], false);
    expect(result.netPoints).toBe(3);
  });

  it('handles tied for first (regular)', () => {
    // 3 participants: 0, 0, 5
    // Two tied for 1st share 1st + 2nd → (3 + 2) / 2 = 2.5
    const result = calculateProjectedPoints(0, null, [0, 0, 5], [], false);
    expect(result.netPoints).toBe(2.5);
  });

  it('handles tied for last (regular)', () => {
    // 4 participants: -2, 0, 5, 5
    // Two tied for 3rd share 3rd + 4th → (2 + 1) / 2 = 1.5
    const result = calculateProjectedPoints(5, null, [-2, 0, 5, 5], [], false);
    expect(result.netPoints).toBe(1.5);
  });

  it('calculates major points correctly for multiple participants', () => {
    // 7 participants, player is 1st → max(7*1.33, 10) = max(9.3, 10) = 10
    const result = calculateProjectedPoints(-5, null, [-5, -2, 0, 1, 3, 5, 8], [], true);
    expect(result.netPoints).toBe(10);
  });

  it('calculates net and scratch independently', () => {
    // Net: player at 0, among [-2, 0, 3] → 2nd of 3 → 2 pts
    // Scratch: player at 5, among [3, 5, 8] → 2nd of 3 → 2 pts
    const result = calculateProjectedPoints(0, 5, [-2, 0, 3], [3, 5, 8], false);
    expect(result.netPoints).toBe(2);
    expect(result.scratchPoints).toBe(2);
  });

  it('can return different net and scratch rankings', () => {
    // Net: player at -3, among [-3, 0, 2] → 1st of 3 → 3 pts
    // Scratch: player at 8, among [2, 5, 8] → 3rd of 3 → 1 pt
    const result = calculateProjectedPoints(-3, 8, [-3, 0, 2], [2, 5, 8], false);
    expect(result.netPoints).toBe(3);
    expect(result.scratchPoints).toBe(1);
  });

  it('handles unsorted input arrays', () => {
    // Input: [5, -2, 3, 0] should be sorted internally
    // Player at 0 → 2nd of 4 → 3 pts
    const result = calculateProjectedPoints(0, null, [5, -2, 3, 0], [], false);
    expect(result.netPoints).toBe(3);
  });
});

// ============================================
// formatNetScore
// ============================================
describe('formatNetScore', () => {
  it('formats even par as E', () => {
    expect(formatNetScore(0)).toBe('E');
  });

  it('formats over par with + prefix', () => {
    expect(formatNetScore(3)).toBe('+3');
    expect(formatNetScore(1)).toBe('+1');
    expect(formatNetScore(15)).toBe('+15');
  });

  it('formats under par with - prefix', () => {
    expect(formatNetScore(-2)).toBe('-2');
    expect(formatNetScore(-1)).toBe('-1');
    expect(formatNetScore(-10)).toBe('-10');
  });
});

// ============================================
// formatGrossScore
// ============================================
describe('formatGrossScore', () => {
  it('formats even par', () => {
    expect(formatGrossScore(72, 72)).toBe('72 (E)');
  });

  it('formats over par', () => {
    expect(formatGrossScore(80, 72)).toBe('80 (+8)');
  });

  it('formats under par', () => {
    expect(formatGrossScore(68, 72)).toBe('68 (-4)');
  });

  it('handles 9-hole par', () => {
    expect(formatGrossScore(40, 36)).toBe('40 (+4)');
    expect(formatGrossScore(36, 36)).toBe('36 (E)');
    expect(formatGrossScore(33, 36)).toBe('33 (-3)');
  });
});

// ============================================
// courseMatchesEventHoles
// ============================================
// ============================================
// calculateProjectedScore
// ============================================
describe('calculateProjectedScore', () => {
  it('returns actual values for complete rounds (no projection)', () => {
    // PH=10, Par=72, Rating=71.2, Gross=82 through 18/18 holes
    const result = calculateProjectedScore(82, 18, 18, 10, 72, 71.2);
    expect(result.projectedGross).toBe(82);
    expect(result.projectedNetOverPar).toBe(82 - 10 - 72); // 0
    expect(result.projectedScratchOverRating).toBe(Math.round(82 - 71.2)); // 11
  });

  it('returns actual values when holesPlayed is 0', () => {
    const result = calculateProjectedScore(0, 0, 18, 10, 72, 71.2);
    expect(result.projectedGross).toBe(0);
    expect(result.projectedNetOverPar).toBe(0 - 10 - 72); // -82
  });

  it('projects a half-round (9 of 18) correctly', () => {
    // 5 over par through 9 holes, PH=10, Par=72, Rating=71.0
    // partialPar = round(72 * 9/18) = 36, overPar = 41 - 36 = 5
    // projectedGross = round(5 + (10/18)*9 + 72) = round(5 + 5 + 72) = 82
    // projectedNOP = round(82 - 10) - 72 = 0
    const result = calculateProjectedScore(41, 9, 18, 10, 72, 71.0);
    expect(result.projectedGross).toBe(82);
    expect(result.projectedNetOverPar).toBe(0);
    expect(result.projectedScratchOverRating).toBe(Math.round(82 - 71.0)); // 11
  });

  it('projects early in a round (3 of 18)', () => {
    // 1 over through 3 holes, PH=15, Par=72, Rating=71.5
    // partialPar = round(72 * 3/18) = 12, overPar = 13 - 12 = 1
    // projectedGross = round(1 + (15/18)*15 + 72) = round(1 + 12.5 + 72) = round(85.5) = 86
    // projectedNOP = round(86 - 15) - 72 = 71 - 72 = -1
    const result = calculateProjectedScore(13, 3, 18, 15, 72, 71.5);
    expect(result.projectedGross).toBe(86);
    expect(result.projectedNetOverPar).toBe(-1);
  });

  it('projects a 9-hole partial round (5 of 9)', () => {
    // 2 over through 5 holes on a par-35, 9-hole course, PH=5, Rating=34.8
    // partialPar = round(35 * 5/9) = round(19.44) = 19, overPar = 21 - 19 = 2
    // projectedGross = round(2 + (5/9)*4 + 35) = round(2 + 2.222 + 35) = round(39.222) = 39
    // projectedNOP = round(39 - 5) - 35 = 34 - 35 = -1
    const result = calculateProjectedScore(21, 5, 9, 5, 35, 34.8);
    expect(result.projectedGross).toBe(39);
    expect(result.projectedNetOverPar).toBe(-1);
    expect(result.projectedScratchOverRating).toBe(Math.round(39 - 34.8)); // 4
  });

  it('handles player shooting well under handicap', () => {
    // Even par through 9 holes (gross 36), PH=12, Par=72, Rating=70.5
    // partialPar = 36, overPar = 0
    // projectedGross = round(0 + (12/18)*9 + 72) = round(6 + 72) = 78
    // projectedNOP = round(78 - 12) - 72 = 66 - 72 = -6
    const result = calculateProjectedScore(36, 9, 18, 12, 72, 70.5);
    expect(result.projectedGross).toBe(78);
    expect(result.projectedNetOverPar).toBe(-6);
  });

  it('handles player shooting over handicap', () => {
    // 10 over through 9 holes (gross 46), PH=6, Par=72, Rating=71.0
    // partialPar = 36, overPar = 10
    // projectedGross = round(10 + (6/18)*9 + 72) = round(10 + 3 + 72) = 85
    // projectedNOP = round(85 - 6) - 72 = 79 - 72 = 7
    const result = calculateProjectedScore(46, 9, 18, 6, 72, 71.0);
    expect(result.projectedGross).toBe(85);
    expect(result.projectedNetOverPar).toBe(7);
  });

  it('matches Glide formula for a known example', () => {
    // Glide worked example: Devin Blankenship E1 2025
    // Full round: PH=10, Par=71, Gross=81 → NOP = 0
    // Simulate as if through 13 holes with proportional gross
    // partialPar = round(71 * 13/18) = round(51.28) = 51
    // If player is E through 13: gross = 51, overPar = 0
    // projectedGross = round(0 + (10/18)*5 + 71) = round(2.778 + 71) = round(73.778) = 74
    // projectedNOP = round(74 - 10) - 71 = 64 - 71 = -7
    // (He was playing well below his handicap through 13 holes)
    const result = calculateProjectedScore(51, 13, 18, 10, 71, 71.0);
    expect(result.projectedGross).toBe(74);
    expect(result.projectedNetOverPar).toBe(-7);
  });
});

describe('courseMatchesEventHoles', () => {
  it('returns true when eventHoles is null or undefined (no active event)', () => {
    expect(courseMatchesEventHoles('18_holes', null)).toBe(true);
    expect(courseMatchesEventHoles('9_holes', null)).toBe(true);
    expect(courseMatchesEventHoles('front_9', undefined)).toBe(true);
    expect(courseMatchesEventHoles('back_9', undefined)).toBe(true);
  });

  it('allows only 18_holes courses for 18-hole events', () => {
    expect(courseMatchesEventHoles('18_holes', 18)).toBe(true);
    expect(courseMatchesEventHoles('9_holes', 18)).toBe(false);
    expect(courseMatchesEventHoles('front_9', 18)).toBe(false);
    expect(courseMatchesEventHoles('back_9', 18)).toBe(false);
  });

  it('allows only 18_holes courses for 36-hole events', () => {
    expect(courseMatchesEventHoles('18_holes', 36)).toBe(true);
    expect(courseMatchesEventHoles('9_holes', 36)).toBe(false);
    expect(courseMatchesEventHoles('front_9', 36)).toBe(false);
    expect(courseMatchesEventHoles('back_9', 36)).toBe(false);
  });

  it('allows only 9-hole courses for 9-hole events', () => {
    expect(courseMatchesEventHoles('9_holes', 9)).toBe(true);
    expect(courseMatchesEventHoles('front_9', 9)).toBe(true);
    expect(courseMatchesEventHoles('back_9', 9)).toBe(true);
    expect(courseMatchesEventHoles('18_holes', 9)).toBe(false);
  });
});
