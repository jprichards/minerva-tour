import { describe, it, expect } from 'vitest';
import { computeActivity } from '@/app/(protected)/stats/components/ActivityChart';
import type { Score } from '@/types/database';

const makeScore = (userId: string, id: string): Score => ({
  id,
  user_id: userId,
  event_id: 'e1',
  course_id: 'c1',
  tee_time: '2025-01-05T10:00:00Z',
  gross_score: 80,
  holes_played: 18,
  is_complete: true,
  course_handicap: 10,
  net_score: 70,
  net_strokes_over_par: -2,
  scratch_strokes_over_rating: null,
  points_awarded: null,
  scratch_points_awarded: null,
  handicap_index_used: 12,
  combined_with_score_id: null,
  is_retroactive: false,
  submitted_by: null,
  created_at: '2025-01-05',
  updated_at: '2025-01-05',
});

const members = [
  { id: 'alice', name: 'Alice Johnson' },
  { id: 'bob', name: 'Bob Smith' },
  { id: 'charlie', name: 'Charlie Brown' },
];

describe('computeActivity', () => {
  it('returns empty array when no scores', () => {
    const result = computeActivity([], members);
    expect(result).toEqual([]);
  });

  it('counts rounds per member and sorts by most rounds', () => {
    const scores = [
      makeScore('alice', 's1'),
      makeScore('alice', 's2'),
      makeScore('alice', 's3'),
      makeScore('bob', 's4'),
      makeScore('charlie', 's5'),
      makeScore('charlie', 's6'),
    ];

    const result = computeActivity(scores, members);

    expect(result).toHaveLength(3);
    expect(result[0]).toEqual({ name: 'Alice Johnson', firstName: 'Alice', rounds: 3 });
    expect(result[1]).toEqual({ name: 'Charlie Brown', firstName: 'Charlie', rounds: 2 });
    expect(result[2]).toEqual({ name: 'Bob Smith', firstName: 'Bob', rounds: 1 });
  });

  it('excludes members with no scores', () => {
    const scores = [makeScore('alice', 's1')];

    const result = computeActivity(scores, members);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice Johnson');
  });

  it('extracts first name correctly', () => {
    const scores = [makeScore('alice', 's1')];

    const result = computeActivity(scores, members);
    expect(result[0].firstName).toBe('Alice');
  });
});
