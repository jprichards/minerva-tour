import { describe, it, expect } from 'vitest';
import { computeEventLeaderboard, computeSeasonStandings } from '@/lib/standings';
import type { Score, Event, Season } from '@/types/database';

const makeSeason = (overrides?: Partial<Season>): Season => ({
  id: 'season-1',
  year: 2025,
  mode: 'regular_season',
  current_event_id: null,
  handicap_allowance: 95,
  created_at: '2025-01-01',
  updated_at: '2025-01-01',
  ...overrides,
});

const makeEvent = (overrides?: Partial<Event>): Event => ({
  id: 'event-1',
  season_id: 'season-1',
  event_number: 1,
  name: 'Event 1',
  start_date: '2025-01-01',
  end_date: '2025-01-14',
  holes: 18,
  is_major: false,
  is_playoff: false,
  created_at: '2025-01-01',
  updated_at: '2025-01-01',
  ...overrides,
});

const makeScore = (overrides?: Partial<Score>): Score => ({
  id: 'score-1',
  user_id: 'user-1',
  event_id: 'event-1',
  course_id: 'course-1',
  tee_time: null,
  gross_score: 80,
  holes_played: 18,
  is_complete: true,
  course_handicap: 10,
  net_score: 70,
  net_strokes_over_par: -2,
  scratch_strokes_over_rating: 8,
  scratch_points_awarded: null,
  points_awarded: null,
  handicap_index_used: 10,
  combined_with_score_id: null,
  is_retroactive: false,
  submitted_by: null,
  created_at: '2025-01-05',
  updated_at: '2025-01-05',
  user: {
    id: 'user-1',
    full_name: 'George Lane',
    email: 'george@test.com',
    role: 'member',
    handicap_index: 10,
    ghin_number: null,
    profile_picture_url: null,
    is_commissioner: false,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
  },
  course: {
    id: 'course-1',
    course_name: 'Pine Valley',
    tee_name: 'Blue',
    type: '18_holes',
    rating: 72,
    slope: 130,
    par: 72,
    created_by: null,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
    updated_by: null,
  },
  ...overrides,
} as Score);

describe('computeEventLeaderboard', () => {
  it('returns empty array when no scores', () => {
    const result = computeEventLeaderboard([], makeEvent(), makeSeason(), 'net');
    expect(result).toEqual([]);
  });

  it('ranks players by net strokes over par', () => {
    const scores = [
      makeScore({ id: 's1', user_id: 'u1', net_strokes_over_par: -5, user: { ...makeScore().user!, id: 'u1', full_name: 'Player A' } }),
      makeScore({ id: 's2', user_id: 'u2', net_strokes_over_par: -2, user: { ...makeScore().user!, id: 'u2', full_name: 'Player B' } }),
      makeScore({ id: 's3', user_id: 'u3', net_strokes_over_par: 3, user: { ...makeScore().user!, id: 'u3', full_name: 'Player C' } }),
    ];

    const result = computeEventLeaderboard(scores, makeEvent(), makeSeason(), 'net');
    expect(result).toHaveLength(3);
    expect(result[0].playerName).toBe('Player A');
    expect(result[0].bestNetOverPar).toBe(-5);
    expect(result[1].playerName).toBe('Player B');
    expect(result[2].playerName).toBe('Player C');
  });

  it('assigns points with tie splitting', () => {
    const scores = [
      makeScore({ id: 's1', user_id: 'u1', net_strokes_over_par: -3, user: { ...makeScore().user!, id: 'u1', full_name: 'Player A' } }),
      makeScore({ id: 's2', user_id: 'u2', net_strokes_over_par: -3, user: { ...makeScore().user!, id: 'u2', full_name: 'Player B' } }),
    ];

    const result = computeEventLeaderboard(scores, makeEvent(), makeSeason(), 'net');
    expect(result).toHaveLength(2);
    expect(result[0].projectedPoints).toBe(result[1].projectedPoints);
    expect(result[0].projectedPoints).toBeGreaterThan(0);
  });

  it('assigns higher points for major events', () => {
    const scores = [
      makeScore({ id: 's1', user_id: 'u1', net_strokes_over_par: -3 }),
    ];

    const regularResult = computeEventLeaderboard(scores, makeEvent(), makeSeason(), 'net');
    const majorResult = computeEventLeaderboard(scores, makeEvent({ is_major: true }), makeSeason(), 'net');

    expect(majorResult[0].projectedPoints).toBeGreaterThan(regularResult[0].projectedPoints);
  });

  it('picks best score per user with multiple rounds', () => {
    const baseUser = { ...makeScore().user!, id: 'u1', full_name: 'Player A' };
    const scores = [
      makeScore({ id: 's1', user_id: 'u1', net_strokes_over_par: -2, user: baseUser }),
      makeScore({ id: 's2', user_id: 'u1', net_strokes_over_par: -5, user: baseUser }),
    ];

    const result = computeEventLeaderboard(scores, makeEvent(), makeSeason(), 'net');
    expect(result).toHaveLength(1);
    expect(result[0].bestNetOverPar).toBe(-5);
  });

  it('excludes incomplete scores when event has ended', () => {
    const scores = [
      makeScore({ id: 's1', user_id: 'u1', is_complete: false, gross_score: 40, holes_played: 9, net_strokes_over_par: null }),
    ];

    const pastEvent = makeEvent({ end_date: '2020-01-01' });
    const result = computeEventLeaderboard(scores, pastEvent, makeSeason(), 'net');
    expect(result).toHaveLength(0);
  });
});

describe('computeSeasonStandings', () => {
  it('returns empty array when no scores', () => {
    const result = computeSeasonStandings([], [], 'net');
    expect(result).toEqual([]);
  });

  it('accumulates points across events', () => {
    const event1 = makeEvent({ id: 'ev1', event_number: 1 });
    const event2 = makeEvent({ id: 'ev2', event_number: 2 });
    const baseUser = { ...makeScore().user!, id: 'u1', full_name: 'Player A' };

    const scores = [
      makeScore({ id: 's1', user_id: 'u1', event_id: 'ev1', net_strokes_over_par: -3, user: baseUser, event: event1 }),
      makeScore({ id: 's2', user_id: 'u1', event_id: 'ev2', net_strokes_over_par: -2, user: baseUser, event: event2 }),
    ];

    const result = computeSeasonStandings(scores, [event1, event2], 'net');
    expect(result).toHaveLength(1);
    expect(result[0].eventsPlayed).toBe(2);
    expect(result[0].totalPoints).toBeGreaterThan(0);
  });

  it('respects throughEventNumber filter', () => {
    const event1 = makeEvent({ id: 'ev1', event_number: 1 });
    const event2 = makeEvent({ id: 'ev2', event_number: 2 });
    const event3 = makeEvent({ id: 'ev3', event_number: 3 });
    const baseUser = { ...makeScore().user!, id: 'u1', full_name: 'Player A' };

    const scores = [
      makeScore({ id: 's1', user_id: 'u1', event_id: 'ev1', net_strokes_over_par: -3, user: baseUser, event: event1 }),
      makeScore({ id: 's2', user_id: 'u1', event_id: 'ev2', net_strokes_over_par: -2, user: baseUser, event: event2 }),
      makeScore({ id: 's3', user_id: 'u1', event_id: 'ev3', net_strokes_over_par: -1, user: baseUser, event: event3 }),
    ];

    const throughEvent2 = computeSeasonStandings(scores, [event1, event2, event3], 'net', 2);
    const allEvents = computeSeasonStandings(scores, [event1, event2, event3], 'net');

    expect(throughEvent2[0].eventsPlayed).toBe(2);
    expect(allEvents[0].eventsPlayed).toBe(3);
  });

  it('excludes playoff events for net standings', () => {
    const regularEvent = makeEvent({ id: 'ev1', event_number: 1, is_playoff: false });
    const playoffEvent = makeEvent({ id: 'ev2', event_number: 2, is_playoff: true });
    const baseUser = { ...makeScore().user!, id: 'u1', full_name: 'Player A' };

    const scores = [
      makeScore({ id: 's1', user_id: 'u1', event_id: 'ev1', net_strokes_over_par: -3, user: baseUser, event: regularEvent }),
      makeScore({ id: 's2', user_id: 'u1', event_id: 'ev2', net_strokes_over_par: -5, user: baseUser, event: playoffEvent }),
    ];

    const netResult = computeSeasonStandings(scores, [regularEvent, playoffEvent], 'net');
    expect(netResult[0].eventsPlayed).toBe(1);

    const scratchResult = computeSeasonStandings(scores, [regularEvent, playoffEvent], 'scratch');
    expect(scratchResult[0].eventsPlayed).toBe(2);
  });

  it('scratch standings use regular points for non-major events regardless of position in season', () => {
    // Major status comes solely from event.is_major in the database.
    // A regular event should never be scored as a major, even if it is the last event
    // in the season or the last event in a throughEventNumber-filtered snapshot.
    const event1 = makeEvent({ id: 'ev1', event_number: 1, is_major: false });
    const event2 = makeEvent({ id: 'ev2', event_number: 2, is_major: false });
    const event3 = makeEvent({ id: 'ev3', event_number: 3, is_major: false });
    const allSeasonEvents = [event1, event2, event3];

    const userA = { ...makeScore().user!, id: 'u1', full_name: 'Player A' };
    const userB = { ...makeScore().user!, id: 'u2', full_name: 'Player B' };

    const scores = [
      makeScore({ id: 's1', user_id: 'u1', event_id: 'ev1', gross_score: 72, user: userA, event: event1 }),
      makeScore({ id: 's2', user_id: 'u2', event_id: 'ev1', gross_score: 78, user: userB, event: event1 }),
    ];

    const throughEvent1 = computeSeasonStandings(scores, allSeasonEvents, 'scratch', 1);

    // Regular points for 2 players: 1st=2, 2nd=1
    expect(throughEvent1[0].totalPoints).toBe(2);
    expect(throughEvent1[1].totalPoints).toBe(1);
  });

  it('scratch standings use major points only when event.is_major is true', () => {
    const regularEvent = makeEvent({ id: 'ev1', event_number: 1, is_major: false });
    const majorEvent = makeEvent({ id: 'ev2', event_number: 2, is_major: true });
    const allSeasonEvents = [regularEvent, majorEvent];

    const userA = { ...makeScore().user!, id: 'u1', full_name: 'Player A' };

    const regularScores = [
      makeScore({ id: 's1', user_id: 'u1', event_id: 'ev1', gross_score: 72, user: userA, event: regularEvent }),
    ];
    const majorScores = [
      makeScore({ id: 's2', user_id: 'u1', event_id: 'ev2', gross_score: 72, user: userA, event: majorEvent }),
    ];

    const regularResult = computeSeasonStandings(regularScores, allSeasonEvents, 'scratch');
    const majorResult = computeSeasonStandings(majorScores, allSeasonEvents, 'scratch');

    // Major event should award more points than regular event (1 player: regular=1, major=max(1.33,10)=10)
    expect(majorResult[0].totalPoints).toBeGreaterThan(regularResult[0].totalPoints);
  });

  it('sorts by total points descending', () => {
    const event1 = makeEvent({ id: 'ev1', event_number: 1 });
    const userA = { ...makeScore().user!, id: 'u1', full_name: 'Player A', handicap_index: 5 };
    const userB = { ...makeScore().user!, id: 'u2', full_name: 'Player B', handicap_index: 10 };

    const scores = [
      makeScore({ id: 's1', user_id: 'u1', event_id: 'ev1', net_strokes_over_par: 0, user: userA, event: event1 }),
      makeScore({ id: 's2', user_id: 'u2', event_id: 'ev1', net_strokes_over_par: -5, user: userB, event: event1 }),
    ];

    const result = computeSeasonStandings(scores, [event1], 'net');
    expect(result[0].playerName).toBe('Player B');
    expect(result[1].playerName).toBe('Player A');
    expect(result[0].totalPoints).toBeGreaterThan(result[1].totalPoints);
  });
});
