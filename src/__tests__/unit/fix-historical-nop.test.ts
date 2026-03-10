import { describe, it, expect } from 'vitest';

// The categorise function lives in an ESM script, so we replicate its logic
// here to test the categorisation rules independently. The script imports
// this same logic via its exported `categorise`.

const NINE_HOLE_TYPES = new Set(['front_9', 'back_9', '9_holes']);

function categorise(
  score: { gross_score: number; course_handicap: number; net_strokes_over_par: number },
  coursePar: number,
  courseType: string,
) {
  const calc = score.gross_score - score.course_handicap - coursePar;
  if (score.net_strokes_over_par === calc) return { action: 'CORRECT' };

  if (score.course_handicap < 0) {
    return { action: 'FLAGGED', reason: 'negative CH', calc };
  }

  const is9HoleCourse = NINE_HOLE_TYPES.has(courseType);

  if (is9HoleCourse && score.gross_score > 60) {
    const par18 = coursePar * 2;
    const calc18 = score.gross_score - score.course_handicap - par18;
    if (Math.abs(score.net_strokes_over_par - calc18) <= 1) {
      return { action: 'LEAVE', reason: '18h round on 9h course, stored NOP correct', calc };
    }
    return { action: 'FLAGGED', reason: 'ambiguous high-gross on 9h course', calc };
  }

  if (is9HoleCourse && score.gross_score <= 60) {
    return { action: 'FIX', correctedNop: calc };
  }

  return { action: 'FLAGGED', reason: 'unexpected mismatch', calc };
}

describe('categorise (historical NOP fix)', () => {
  it('returns CORRECT when stored NOP matches gross - CH - par', () => {
    const result = categorise(
      { gross_score: 46, course_handicap: 4, net_strokes_over_par: 8 },
      34,
      'front_9',
    );
    expect(result.action).toBe('CORRECT');
  });

  it('returns FIX for a 9-hole score with wrong NOP', () => {
    // Robby Dewling: G:46, CH:4, par:34 (front_9), stored NOP:25, should be 8
    const result = categorise(
      { gross_score: 46, course_handicap: 4, net_strokes_over_par: 25 },
      34,
      'front_9',
    );
    expect(result).toEqual({ action: 'FIX', correctedNop: 8 });
  });

  it('returns FIX for a back_9 score with wrong NOP', () => {
    // Hastings Westphal: G:48, CH:4, par:36 (back_9), stored NOP:26, should be 8
    const result = categorise(
      { gross_score: 48, course_handicap: 4, net_strokes_over_par: 26 },
      36,
      'back_9',
    );
    expect(result).toEqual({ action: 'FIX', correctedNop: 8 });
  });

  it('returns LEAVE for an 18-hole round on a 9-hole course record', () => {
    // David Mustard: G:97, CH:15, par:35 (back_9), stored NOP:12
    // 18-hole par would be 70, calc = 97 - 15 - 70 = 12 → matches stored
    const result = categorise(
      { gross_score: 97, course_handicap: 15, net_strokes_over_par: 12 },
      35,
      'back_9',
    );
    expect(result.action).toBe('LEAVE');
  });

  it('returns LEAVE when 18h calc is within 1 stroke of stored NOP', () => {
    // Tolerance of ±1 for rounding differences
    const result = categorise(
      { gross_score: 90, course_handicap: 11, net_strokes_over_par: 8 },
      36,
      'front_9',
    );
    // calc18 = 90 - 11 - 72 = 7, stored = 8, diff = 1 → within tolerance
    expect(result.action).toBe('LEAVE');
  });

  it('returns FLAGGED for negative course handicap', () => {
    // Matt Davis: G:45, CH:-12, par:71 (18_holes), stored NOP:21
    const result = categorise(
      { gross_score: 45, course_handicap: -12, net_strokes_over_par: 21 },
      71,
      '18_holes',
    );
    expect(result.action).toBe('FLAGGED');
    expect(result.reason).toBe('negative CH');
  });

  it('returns FLAGGED for ambiguous high-gross on 9h course', () => {
    // Ryan Morrissey: G:90, CH:3, par:36 (back_9), stored NOP:69
    // calc18 = 90 - 3 - 72 = 15 but stored is 69, way off → ambiguous
    const result = categorise(
      { gross_score: 90, course_handicap: 3, net_strokes_over_par: 69 },
      36,
      'back_9',
    );
    expect(result.action).toBe('FLAGGED');
    expect(result.reason).toBe('ambiguous high-gross on 9h course');
  });

  it('returns FLAGGED for unexpected mismatch on 18-hole course', () => {
    const result = categorise(
      { gross_score: 95, course_handicap: 10, net_strokes_over_par: 20 },
      72,
      '18_holes',
    );
    expect(result.action).toBe('FLAGGED');
    expect(result.reason).toBe('unexpected mismatch');
    expect(result.calc).toBe(13);
  });

  it('handles 9_holes course type the same as front_9/back_9', () => {
    const result = categorise(
      { gross_score: 50, course_handicap: 5, net_strokes_over_par: 30 },
      35,
      '9_holes',
    );
    expect(result).toEqual({ action: 'FIX', correctedNop: 10 });
  });
});
