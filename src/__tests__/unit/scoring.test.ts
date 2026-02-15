import { describe, it, expect } from 'vitest';
import {
  calculateCourseHandicap,
  calculatePartialCourseHandicap,
  calculatePartialPar,
  getMaxHoles,
  calculateNetScore,
  calculateScratchScore,
  calculateRegularEventPoints,
  calculateMajorEventPoints,
  splitTiedPoints,
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
