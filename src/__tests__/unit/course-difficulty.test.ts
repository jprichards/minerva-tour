import { describe, it, expect } from 'vitest';
import { computeCourseDifficulty } from '@/app/(protected)/stats/components/CourseDifficulty';
import type { Score } from '@/types/database';

const makeScore = (userId: string, courseName: string, nop: number, id: string): Score => ({
  id,
  user_id: userId,
  event_id: 'e1',
  course_id: 'c1',
  tee_time: null,
  gross_score: 72 + nop,
  holes_played: 18,
  is_complete: true,
  course_handicap: 0,
  net_score: 72 + nop,
  net_strokes_over_par: nop,
  scratch_strokes_over_rating: null,
  points_awarded: null,
  scratch_points_awarded: null,
  handicap_index_used: null,
  combined_with_score_id: null,
  is_retroactive: false,
  submitted_by: null,
  created_at: '',
  updated_at: '',
  course: { course_name: courseName, tee_name: 'Blue', par: 72, type: '18_holes', rating: 72, slope: 113 },
});

describe('computeCourseDifficulty', () => {
  it('returns empty array when no scores', () => {
    expect(computeCourseDifficulty([])).toEqual([]);
  });

  it('computes average net correctly', () => {
    const scores = [
      makeScore('alice', 'Pine Hills', 4, 's1'),
      makeScore('bob', 'Pine Hills', 2, 's2'),
      makeScore('charlie', 'Pine Hills', 6, 's3'),
    ];

    const result = computeCourseDifficulty(scores);

    expect(result).toHaveLength(1);
    expect(result[0].courseName).toBe('Pine Hills');
    expect(result[0].avgNet).toBe(4);
    expect(result[0].avgGross).toBe(76);
    expect(result[0].roundCount).toBe(3);
  });

  it('filters out courses with fewer than 3 rounds', () => {
    const scores = [
      makeScore('alice', 'Pine Hills', 2, 's1'),
      makeScore('bob', 'Pine Hills', 3, 's2'),
      makeScore('alice', 'Oak Valley', 1, 's3'),
      makeScore('bob', 'Oak Valley', 2, 's4'),
      makeScore('charlie', 'Oak Valley', 0, 's5'),
    ];

    const result = computeCourseDifficulty(scores);

    expect(result).toHaveLength(1);
    expect(result[0].courseName).toBe('Oak Valley');
  });

  it('sorts hardest first by default', () => {
    const scores = [
      makeScore('a', 'Easy Course', -2, 's1'),
      makeScore('b', 'Easy Course', -1, 's2'),
      makeScore('c', 'Easy Course', -3, 's3'),
      makeScore('a', 'Hard Course', 5, 's4'),
      makeScore('b', 'Hard Course', 7, 's5'),
      makeScore('c', 'Hard Course', 3, 's6'),
      makeScore('a', 'Mid Course', 1, 's7'),
      makeScore('b', 'Mid Course', 0, 's8'),
      makeScore('c', 'Mid Course', 2, 's9'),
    ];

    const result = computeCourseDifficulty(scores);

    expect(result).toHaveLength(3);
    expect(result[0].courseName).toBe('Hard Course');
    expect(result[1].courseName).toBe('Mid Course');
    expect(result[2].courseName).toBe('Easy Course');
  });

  it('rounds avgNet to one decimal place', () => {
    const scores = [
      makeScore('a', 'Pine Hills', 1, 's1'),
      makeScore('b', 'Pine Hills', 2, 's2'),
      makeScore('c', 'Pine Hills', 3, 's3'),
    ];

    const result = computeCourseDifficulty(scores);
    expect(result[0].avgNet).toBe(2);
  });

  it('handles negative average correctly', () => {
    const scores = [
      makeScore('a', 'Easy Course', -3, 's1'),
      makeScore('b', 'Easy Course', -1, 's2'),
      makeScore('c', 'Easy Course', -2, 's3'),
    ];

    const result = computeCourseDifficulty(scores);
    expect(result[0].avgNet).toBe(-2);
  });

  it('skips scores with null net_strokes_over_par', () => {
    const scores = [
      makeScore('a', 'Pine Hills', 2, 's1'),
      makeScore('b', 'Pine Hills', 4, 's2'),
      { ...makeScore('c', 'Pine Hills', 0, 's3'), net_strokes_over_par: null },
    ];

    const result = computeCourseDifficulty(scores);
    // Only 2 valid scores for Pine Hills, below the 3-round minimum
    expect(result).toHaveLength(0);
  });

  it('separates 9-hole and 18-hole scores at the same course', () => {
    const make9H = (userId: string, courseName: string, nop: number, id: string): Score => ({
      ...makeScore(userId, courseName, nop, id),
      gross_score: 36 + nop,
      course: { course_name: courseName, tee_name: 'Blue', par: 36, type: '9_holes', rating: 36, slope: 113 },
    });

    const scores = [
      makeScore('a', 'Cherokee CC', 5, 's1'),
      makeScore('b', 'Cherokee CC', 7, 's2'),
      makeScore('c', 'Cherokee CC', 3, 's3'),
      make9H('a', 'Cherokee CC', 2, 's4'),
      make9H('b', 'Cherokee CC', 4, 's5'),
      make9H('c', 'Cherokee CC', 6, 's6'),
    ];

    const result = computeCourseDifficulty(scores);

    expect(result).toHaveLength(2);
    const names = result.map((r) => r.courseName);
    expect(names).toContain('Cherokee CC');
    expect(names).toContain('Cherokee CC (9H)');

    const full18 = result.find((r) => r.courseName === 'Cherokee CC')!;
    const nine = result.find((r) => r.courseName === 'Cherokee CC (9H)')!;
    expect(full18.avgGross).toBe(77);
    expect(nine.avgGross).toBe(40);
  });
});
