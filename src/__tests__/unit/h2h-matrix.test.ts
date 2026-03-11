import { describe, it, expect } from 'vitest';
import { computeH2HMatrix, computeH2HLeaderboard } from '@/app/(protected)/stats/components/HeadToHeadMatrix';
import type { Score } from '@/types/database';

const makeScore = (userId: string, eventId: string, nop: number, id: string): Score => ({
  id,
  user_id: userId,
  event_id: eventId,
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
});

const members = [
  { id: 'alice', name: 'Alice' },
  { id: 'bob', name: 'Bob' },
  { id: 'charlie', name: 'Charlie' },
];

describe('computeH2HMatrix', () => {
  it('returns empty matrix and empty activeMembers for empty scores', () => {
    const { matrix, activeMembers } = computeH2HMatrix([], members);
    expect(matrix).toEqual({});
    expect(activeMembers).toEqual([]);
  });

  it('computes wins/losses for two players across multiple events', () => {
    const scores: Score[] = [
      makeScore('alice', 'e1', 2, 's1'),
      makeScore('bob', 'e1', 5, 's2'),
      makeScore('alice', 'e2', 4, 's3'),
      makeScore('bob', 'e2', 1, 's4'),
      makeScore('alice', 'e3', 3, 's5'),
      makeScore('bob', 'e3', 6, 's6'),
    ];

    const { matrix } = computeH2HMatrix(scores, members);
    expect(matrix['alice']['bob']).toEqual({ wins: 2, losses: 1, ties: 0 });
    expect(matrix['bob']['alice']).toEqual({ wins: 1, losses: 2, ties: 0 });
  });

  it('handles ties correctly', () => {
    const scores: Score[] = [
      makeScore('alice', 'e1', 3, 's1'),
      makeScore('bob', 'e1', 3, 's2'),
      makeScore('alice', 'e2', 2, 's3'),
      makeScore('bob', 'e2', 5, 's4'),
    ];

    const { matrix } = computeH2HMatrix(scores, members);
    expect(matrix['alice']['bob']).toEqual({ wins: 1, losses: 0, ties: 1 });
    expect(matrix['bob']['alice']).toEqual({ wins: 0, losses: 1, ties: 1 });
  });

  it('produces a symmetric matrix (A wins vs B = B losses vs A)', () => {
    const scores: Score[] = [
      makeScore('alice', 'e1', 1, 's1'),
      makeScore('bob', 'e1', 4, 's2'),
      makeScore('charlie', 'e1', 2, 's3'),
      makeScore('alice', 'e2', 5, 's4'),
      makeScore('bob', 'e2', 3, 's5'),
      makeScore('charlie', 'e2', 3, 's6'),
    ];

    const { matrix } = computeH2HMatrix(scores, members);

    for (const a of ['alice', 'bob', 'charlie']) {
      for (const b of ['alice', 'bob', 'charlie']) {
        if (a === b) continue;
        expect(matrix[a][b].wins).toBe(matrix[b][a].losses);
        expect(matrix[a][b].losses).toBe(matrix[b][a].wins);
        expect(matrix[a][b].ties).toBe(matrix[b][a].ties);
      }
    }
  });

  it('picks the best score per user per event', () => {
    const scores: Score[] = [
      makeScore('alice', 'e1', 6, 's1'),
      makeScore('alice', 'e1', 2, 's2'),
      makeScore('bob', 'e1', 4, 's3'),
      makeScore('bob', 'e1', 3, 's4'),
    ];

    const { matrix } = computeH2HMatrix(scores, members);
    // Alice best = 2, Bob best = 3 => Alice wins
    expect(matrix['alice']['bob']).toEqual({ wins: 1, losses: 0, ties: 0 });
  });

  it('only includes members who participated in at least one event', () => {
    const scores: Score[] = [
      makeScore('alice', 'e1', 2, 's1'),
      makeScore('bob', 'e1', 4, 's2'),
    ];

    const { matrix, activeMembers } = computeH2HMatrix(scores, members);
    expect(activeMembers).toEqual(['alice', 'bob']);
    expect(matrix['charlie']).toBeUndefined();
  });

  it('skips scores with null event_id', () => {
    const nullEventScore: Score = {
      ...makeScore('alice', 'e1', 2, 's1'),
      event_id: null,
    };
    const scores: Score[] = [
      nullEventScore,
      makeScore('bob', 'e1', 4, 's2'),
      makeScore('alice', 'e2', 3, 's3'),
      makeScore('bob', 'e2', 1, 's4'),
    ];

    const { matrix } = computeH2HMatrix(scores, members);
    // Alice's null-event score is ignored; only e2 counts where Bob wins
    expect(matrix['alice']['bob']).toEqual({ wins: 0, losses: 1, ties: 0 });
    expect(matrix['bob']['alice']).toEqual({ wins: 1, losses: 0, ties: 0 });
  });

  it('sorts activeMembers by member name', () => {
    const scores: Score[] = [
      makeScore('charlie', 'e1', 1, 's1'),
      makeScore('alice', 'e1', 2, 's2'),
      makeScore('bob', 'e1', 3, 's3'),
    ];

    const { activeMembers } = computeH2HMatrix(scores, members);
    expect(activeMembers).toEqual(['alice', 'bob', 'charlie']);
  });
});

describe('computeH2HLeaderboard', () => {
  it('ranks members by win percentage', () => {
    const scores: Score[] = [
      makeScore('alice', 'e1', 1, 's1'),
      makeScore('bob', 'e1', 3, 's2'),
      makeScore('charlie', 'e1', 5, 's3'),
      makeScore('alice', 'e2', 2, 's4'),
      makeScore('bob', 'e2', 4, 's5'),
      makeScore('charlie', 'e2', 6, 's6'),
    ];

    const { matrix, activeMembers } = computeH2HMatrix(scores, members);
    const memberMap = new Map(members.map((m) => [m.id, m.name]));
    const lb = computeH2HLeaderboard(matrix, activeMembers, memberMap);

    expect(lb[0].id).toBe('alice');
    expect(lb[0].wins).toBe(4);
    expect(lb[0].losses).toBe(0);
    expect(lb[0].winPct).toBe(100);

    expect(lb[1].id).toBe('bob');
    expect(lb[1].wins).toBe(2);
    expect(lb[1].losses).toBe(2);
    expect(lb[1].winPct).toBe(50);

    expect(lb[2].id).toBe('charlie');
    expect(lb[2].winPct).toBe(0);
  });

  it('counts ties as half a win for win percentage', () => {
    const scores: Score[] = [
      makeScore('alice', 'e1', 3, 's1'),
      makeScore('bob', 'e1', 3, 's2'),
    ];

    const { matrix, activeMembers } = computeH2HMatrix(scores, members);
    const memberMap = new Map(members.map((m) => [m.id, m.name]));
    const lb = computeH2HLeaderboard(matrix, activeMembers, memberMap);

    expect(lb[0].ties).toBe(1);
    expect(lb[0].winPct).toBe(50);
  });
});
