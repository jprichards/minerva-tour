import { describe, it, expect } from 'vitest';
import { computeTourRecords } from '@/app/(protected)/stats/components/TourRecords';
import type { Score, Event } from '@/types/database';

const makeScore = (
  userId: string,
  nop: number,
  eventId: string,
  id: string,
  grossScore?: number,
  courseName?: string
): Score => ({
  id,
  user_id: userId,
  event_id: eventId,
  course_id: 'c1',
  tee_time: null,
  gross_score: grossScore ?? 72 + nop,
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
  course: {
    id: 'c1',
    course_name: courseName ?? 'Test Course',
    tee_name: 'Blue',
    par: 72,
    type: '18_holes',
    rating: 72,
    slope: 113,
    created_by: null,
    created_at: '',
    updated_at: '',
    updated_by: null,
  },
});

const makeEvent = (id: string, eventNumber: number): Event => ({
  id,
  season_id: 's1',
  event_number: eventNumber,
  name: null,
  start_date: '2025-01-01',
  end_date: '2025-01-14',
  holes: 18,
  is_major: false,
  is_playoff: false,
  created_at: '',
  updated_at: '',
});

const members = [
  { id: 'u1', name: 'Alice' },
  { id: 'u2', name: 'Bob' },
  { id: 'u3', name: 'Charlie' },
];

describe('computeTourRecords', () => {
  it('returns empty array when scores is empty', () => {
    expect(computeTourRecords([], [], members)).toEqual([]);
  });

  it('correctly identifies best net round', () => {
    const scores = [
      makeScore('u1', 3, 'e1', 's1'),
      makeScore('u2', -2, 'e1', 's2', undefined, 'Eagle Creek'),
      makeScore('u1', 1, 'e2', 's3'),
    ];
    const events = [makeEvent('e1', 1), makeEvent('e2', 2)];
    const records = computeTourRecords(scores, events, members);
    const bestNet = records.find((r) => r.label === 'Best Net Round');
    expect(bestNet).toBeDefined();
    expect(bestNet!.value).toBe('-2');
    expect(bestNet!.detail).toContain('Bob');
    expect(bestNet!.detail).toContain('Eagle Creek');
    expect(bestNet!.icon).toBe('trophy');
  });

  it('correctly computes most event wins', () => {
    const scores = [
      // Event 1: u1 wins with -1
      makeScore('u1', -1, 'e1', 's1'),
      makeScore('u2', 2, 'e1', 's2'),
      // Event 2: u1 wins with 0
      makeScore('u1', 0, 'e2', 's3'),
      makeScore('u2', 1, 'e2', 's4'),
      // Event 3: u2 wins with -3
      makeScore('u1', 5, 'e3', 's5'),
      makeScore('u2', -3, 'e3', 's6'),
    ];
    const events = [makeEvent('e1', 1), makeEvent('e2', 2), makeEvent('e3', 3)];
    const records = computeTourRecords(scores, events, members);
    const wins = records.find((r) => r.label === 'Most Event Wins');
    expect(wins).toBeDefined();
    expect(wins!.value).toBe('2');
    expect(wins!.detail).toBe('Alice');
    expect(wins!.icon).toBe('medal');
  });

  it('respects minimum round threshold for lowest avg net', () => {
    // u1 has 4 rounds (below threshold), u2 has 5 rounds (at threshold)
    const scores = [
      makeScore('u1', -5, 'e1', 's1'),
      makeScore('u1', -4, 'e1', 's2'),
      makeScore('u1', -3, 'e2', 's3'),
      makeScore('u1', -6, 'e2', 's4'),
      makeScore('u2', 0, 'e1', 's5'),
      makeScore('u2', 1, 'e2', 's6'),
      makeScore('u2', -1, 'e3', 's7'),
      makeScore('u2', 2, 'e3', 's8'),
      makeScore('u2', 0, 'e4', 's9'),
    ];
    const events = [makeEvent('e1', 1), makeEvent('e2', 2), makeEvent('e3', 3), makeEvent('e4', 4)];
    const records = computeTourRecords(scores, events, members);
    const avgNet = records.find((r) => r.label === 'Lowest Avg Net');
    expect(avgNet).toBeDefined();
    // u2 avg = (0+1-1+2+0)/5 = 0.4, u1 excluded (only 4 rounds)
    expect(avgNet!.detail).toContain('Bob');
    expect(avgNet!.value).toBe('+0.4');
  });
});
