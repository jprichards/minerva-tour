import { describe, it, expect } from 'vitest';
import { computePointsRace } from '@/app/(protected)/stats/components/PointsRaceChart';
import type { Score, Event } from '@/types/database';

const makeEvent = (overrides: Partial<Event> & { id: string; event_number: number }): Event => ({
  season_id: 'season-1',
  name: `Event ${overrides.event_number}`,
  start_date: '2025-01-01',
  end_date: '2025-01-14',
  holes: 18,
  is_major: false,
  is_playoff: false,
  created_at: '2025-01-01',
  updated_at: '2025-01-01',
  ...overrides,
});

const makeScore = (overrides: Partial<Score> & { id: string; user_id: string; event_id: string }): Score => ({
  course_id: 'course-1',
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
  course: { id: 'course-1', course_name: 'Test Course', tee_name: 'Blue', par: 72, type: '18_holes', rating: 72, slope: 113, created_by: null, created_at: '', updated_at: '', updated_by: null },
  ...overrides,
});

const members = [
  { id: 'alice', name: 'Alice' },
  { id: 'bob', name: 'Bob' },
  { id: 'charlie', name: 'Charlie' },
];

describe('computePointsRace', () => {
  it('returns empty data when no events', () => {
    const { data, activeMemberIds } = computePointsRace([], [], members, 'net');
    expect(data).toEqual([]);
    expect(activeMemberIds).toEqual([]);
  });

  it('computes cumulative net points across two events', () => {
    const events = [
      makeEvent({ id: 'e1', event_number: 1 }),
      makeEvent({ id: 'e2', event_number: 2 }),
    ];

    const scores: Score[] = [
      // Event 1: Alice wins (-3), Bob 2nd (-1), Charlie 3rd (+2)
      makeScore({ id: 's1', user_id: 'alice', event_id: 'e1', net_strokes_over_par: -3 }),
      makeScore({ id: 's2', user_id: 'bob', event_id: 'e1', net_strokes_over_par: -1 }),
      makeScore({ id: 's3', user_id: 'charlie', event_id: 'e1', net_strokes_over_par: 2 }),
      // Event 2: Bob wins (-4), Alice 2nd (-2), Charlie 3rd (+1)
      makeScore({ id: 's4', user_id: 'bob', event_id: 'e2', net_strokes_over_par: -4 }),
      makeScore({ id: 's5', user_id: 'alice', event_id: 'e2', net_strokes_over_par: -2 }),
      makeScore({ id: 's6', user_id: 'charlie', event_id: 'e2', net_strokes_over_par: 1 }),
    ];

    const { data, activeMemberIds } = computePointsRace(scores, events, members, 'net');

    // 3 data points: starting zero + 2 events
    expect(data).toHaveLength(3);
    expect(activeMemberIds).toEqual(['alice', 'bob', 'charlie']);

    // Starting point: all at 0
    expect(data[0].eventLabel).toBe('0');
    expect(data[0].alice).toBe(0);
    expect(data[0].bob).toBe(0);
    expect(data[0].charlie).toBe(0);

    // Event 1: 3 participants => 1st=3pts, 2nd=2pts, 3rd=1pt
    expect(data[1].alice).toBe(3);
    expect(data[1].bob).toBe(2);
    expect(data[1].charlie).toBe(1);

    // Event 2 cumulative: Alice 3+2=5, Bob 2+3=5, Charlie 1+1=2
    expect(data[2].alice).toBe(5);
    expect(data[2].bob).toBe(5);
    expect(data[2].charlie).toBe(2);
  });

  it('handles ties with split points', () => {
    const events = [makeEvent({ id: 'e1', event_number: 1 })];

    const scores: Score[] = [
      // Alice and Bob tie at -2, Charlie at +1
      makeScore({ id: 's1', user_id: 'alice', event_id: 'e1', net_strokes_over_par: -2 }),
      makeScore({ id: 's2', user_id: 'bob', event_id: 'e1', net_strokes_over_par: -2 }),
      makeScore({ id: 's3', user_id: 'charlie', event_id: 'e1', net_strokes_over_par: 1 }),
    ];

    const { data } = computePointsRace(scores, events, members, 'net');

    // 3 participants: 1st=3, 2nd=2 => tied => split (3+2)/2 = 2.5
    expect(data[1].alice).toBe(2.5);
    expect(data[1].bob).toBe(2.5);
    expect(data[1].charlie).toBe(1);
  });

  it('awards major event points for major events', () => {
    const events = [makeEvent({ id: 'e1', event_number: 1, is_major: true })];

    const scores: Score[] = [
      makeScore({ id: 's1', user_id: 'alice', event_id: 'e1', net_strokes_over_par: -3 }),
      makeScore({ id: 's2', user_id: 'bob', event_id: 'e1', net_strokes_over_par: 0 }),
    ];

    const { data } = computePointsRace(scores, events, members, 'net');

    // Major: 2 participants => 1st = max(round(2*1.33*10)/10, 10) = 10
    expect(data[1].alice).toBe(10);
    // 2nd = 10 - 3 = 7
    expect(data[1].bob).toBe(7);
  });

  it('picks best score per user per event', () => {
    const events = [makeEvent({ id: 'e1', event_number: 1 })];

    const scores: Score[] = [
      makeScore({ id: 's1', user_id: 'alice', event_id: 'e1', net_strokes_over_par: 5 }),
      makeScore({ id: 's2', user_id: 'alice', event_id: 'e1', net_strokes_over_par: -1 }),
      makeScore({ id: 's3', user_id: 'bob', event_id: 'e1', net_strokes_over_par: 0 }),
    ];

    const { data } = computePointsRace(scores, events, members, 'net');

    // Alice's best is -1 (1st), Bob is 0 (2nd)
    expect(data[1].alice).toBe(2);
    expect(data[1].bob).toBe(1);
  });

  it('excludes playoff events in net mode', () => {
    const events = [
      makeEvent({ id: 'e1', event_number: 1 }),
      makeEvent({ id: 'e2', event_number: 2, is_playoff: true }),
    ];

    const scores: Score[] = [
      makeScore({ id: 's1', user_id: 'alice', event_id: 'e1', net_strokes_over_par: -2 }),
      makeScore({ id: 's2', user_id: 'bob', event_id: 'e1', net_strokes_over_par: 0 }),
      makeScore({ id: 's3', user_id: 'alice', event_id: 'e2', net_strokes_over_par: -3 }),
      makeScore({ id: 's4', user_id: 'bob', event_id: 'e2', net_strokes_over_par: 1 }),
    ];

    const { data } = computePointsRace(scores, events, members, 'net');

    // Starting zero + event 1
    expect(data).toHaveLength(2);
    expect(data[0].eventLabel).toBe('0');
    expect(data[1].eventLabel).toBe('1');
  });

  it('includes playoff events in scratch mode', () => {
    const events = [
      makeEvent({ id: 'e1', event_number: 1 }),
      makeEvent({ id: 'e2', event_number: 2, is_playoff: true }),
    ];

    const scores: Score[] = [
      makeScore({ id: 's1', user_id: 'alice', event_id: 'e1', net_strokes_over_par: -2, gross_score: 75 }),
      makeScore({ id: 's2', user_id: 'bob', event_id: 'e1', net_strokes_over_par: 0, gross_score: 80 }),
      makeScore({ id: 's3', user_id: 'alice', event_id: 'e2', net_strokes_over_par: -3, gross_score: 73 }),
      makeScore({ id: 's4', user_id: 'bob', event_id: 'e2', net_strokes_over_par: 1, gross_score: 82 }),
    ];

    const { data } = computePointsRace(scores, events, members, 'scratch');

    // Starting zero + both events included in scratch mode
    expect(data).toHaveLength(3);
  });

  it('labels major events with asterisk', () => {
    const events = [
      makeEvent({ id: 'e1', event_number: 1 }),
      makeEvent({ id: 'e2', event_number: 2, is_major: true }),
    ];

    const scores: Score[] = [
      makeScore({ id: 's1', user_id: 'alice', event_id: 'e1', net_strokes_over_par: 0 }),
      makeScore({ id: 's2', user_id: 'alice', event_id: 'e2', net_strokes_over_par: 0 }),
    ];

    const { data } = computePointsRace(scores, events, members, 'net');

    expect(data[0].eventLabel).toBe('0');
    expect(data[1].eventLabel).toBe('1');
    expect(data[2].eventLabel).toBe('2*');
  });

  it('only includes members who participated in activeMemberIds', () => {
    const events = [makeEvent({ id: 'e1', event_number: 1 })];

    const scores: Score[] = [
      makeScore({ id: 's1', user_id: 'alice', event_id: 'e1', net_strokes_over_par: -2 }),
    ];

    const { activeMemberIds } = computePointsRace(scores, events, members, 'net');

    expect(activeMemberIds).toEqual(['alice']);
    expect(activeMemberIds).not.toContain('bob');
    expect(activeMemberIds).not.toContain('charlie');
  });

  it('excludes future events that have no scores', () => {
    const events = [
      makeEvent({ id: 'e1', event_number: 1 }),
      makeEvent({ id: 'e2', event_number: 2 }),
      makeEvent({ id: 'e3', event_number: 3 }),
    ];

    const scores: Score[] = [
      makeScore({ id: 's1', user_id: 'alice', event_id: 'e1', net_strokes_over_par: -2 }),
      makeScore({ id: 's2', user_id: 'bob', event_id: 'e1', net_strokes_over_par: 0 }),
    ];

    const { data } = computePointsRace(scores, events, members, 'net');

    // Starting zero + 1 event with scores
    expect(data).toHaveLength(2);
    expect(data[0].eventLabel).toBe('0');
    expect(data[1].eventLabel).toBe('1');
  });

  it('prepends a starting point at zero so lines are drawn from origin', () => {
    const events = [makeEvent({ id: 'e1', event_number: 1 })];

    const scores: Score[] = [
      makeScore({ id: 's1', user_id: 'alice', event_id: 'e1', net_strokes_over_par: -3 }),
      makeScore({ id: 's2', user_id: 'bob', event_id: 'e1', net_strokes_over_par: 0 }),
    ];

    const { data } = computePointsRace(scores, events, members, 'net');

    expect(data).toHaveLength(2);

    // First data point is the origin
    expect(data[0].eventLabel).toBe('0');
    expect(data[0].eventNumber).toBe(0);
    expect(data[0].alice).toBe(0);
    expect(data[0].bob).toBe(0);
    expect(data[0].charlie).toBeUndefined();

    // Second data point is event 1 with actual points
    expect(data[1].eventLabel).toBe('1');
    expect(data[1].alice).toBe(2);
    expect(data[1].bob).toBe(1);
  });
});
