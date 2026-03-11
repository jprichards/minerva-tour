import { describe, it, expect } from 'vitest';
import { computeCourseExplorer } from '@/app/(protected)/stats/components/CourseExplorer';
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

const members = [
  { id: 'alice', name: 'Alice Johnson' },
  { id: 'bob', name: 'Bob Smith' },
  { id: 'charlie', name: 'Charlie Brown' },
];

describe('computeCourseExplorer', () => {
  it('returns empty array when no scores', () => {
    expect(computeCourseExplorer([], members)).toEqual([]);
  });

  it('counts unique courses per member correctly', () => {
    const scores = [
      makeScore('alice', 'Pine Hills', 2, 's1'),
      makeScore('alice', 'Pine Hills', 0, 's2'),
      makeScore('alice', 'Oak Valley', -1, 's3'),
      makeScore('alice', 'River Run', 3, 's4'),
      makeScore('bob', 'Pine Hills', 1, 's5'),
      makeScore('bob', 'Oak Valley', 2, 's6'),
    ];

    const result = computeCourseExplorer(scores, members);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ name: 'Alice Johnson', uniqueCourses: 3 });
    expect(result[1]).toEqual({ name: 'Bob Smith', uniqueCourses: 2 });
  });

  it('sorts by most unique courses first', () => {
    const scores = [
      makeScore('bob', 'Pine Hills', 0, 's1'),
      makeScore('bob', 'Oak Valley', 0, 's2'),
      makeScore('bob', 'River Run', 0, 's3'),
      makeScore('alice', 'Pine Hills', 0, 's4'),
    ];

    const result = computeCourseExplorer(scores, members);

    expect(result[0].name).toBe('Bob Smith');
    expect(result[0].uniqueCourses).toBe(3);
    expect(result[1].name).toBe('Alice Johnson');
    expect(result[1].uniqueCourses).toBe(1);
  });

  it('excludes members with no scores', () => {
    const scores = [
      makeScore('alice', 'Pine Hills', 0, 's1'),
    ];

    const result = computeCourseExplorer(scores, members);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Alice Johnson');
  });

  it('does not double-count repeated courses for same member', () => {
    const scores = [
      makeScore('alice', 'Pine Hills', 0, 's1'),
      makeScore('alice', 'Pine Hills', 2, 's2'),
      makeScore('alice', 'Pine Hills', -1, 's3'),
    ];

    const result = computeCourseExplorer(scores, members);

    expect(result).toHaveLength(1);
    expect(result[0].uniqueCourses).toBe(1);
  });

  it('skips scores without course data', () => {
    const scoreNoCourse: Score = {
      id: 's1',
      user_id: 'alice',
      event_id: 'e1',
      course_id: 'c1',
      tee_time: null,
      gross_score: 72,
      holes_played: 18,
      is_complete: true,
      course_handicap: 0,
      net_score: 72,
      net_strokes_over_par: 0,
      scratch_strokes_over_rating: null,
      points_awarded: null,
      scratch_points_awarded: null,
      handicap_index_used: null,
      combined_with_score_id: null,
      is_retroactive: false,
      submitted_by: null,
      created_at: '',
      updated_at: '',
    };

    const result = computeCourseExplorer([scoreNoCourse], members);
    expect(result).toEqual([]);
  });
});
