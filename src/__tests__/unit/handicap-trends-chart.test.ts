import { describe, it, expect } from 'vitest';
import { computeHandicapTrends } from '@/app/(protected)/stats/components/HandicapTrends';
import type { HandicapHistory } from '@/types/database';

const makeEntry = (userId: string, index: number, date: string, id: string): HandicapHistory => ({
  id,
  user_id: userId,
  handicap_index: index,
  effective_date: date,
  source: null,
  created_at: date,
});

const members = [
  { id: 'u1', name: 'Alice Smith' },
  { id: 'u2', name: 'Bob Jones' },
  { id: 'u3', name: 'Charlie Brown' },
];

describe('computeHandicapTrends', () => {
  it('returns empty data and activeMemberIds for empty history', () => {
    const result = computeHandicapTrends([], members);
    expect(result.data).toEqual([]);
    expect(result.activeMemberIds).toEqual([]);
  });

  it('builds data points with correct member values', () => {
    const history = [
      makeEntry('u1', 12.3, '2025-01-15', '1'),
      makeEntry('u2', 18.0, '2025-01-15', '2'),
      makeEntry('u1', 11.5, '2025-02-15', '3'),
      makeEntry('u2', 17.2, '2025-02-15', '4'),
    ];

    const result = computeHandicapTrends(history, members);

    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toEqual({ date: "Jan '25", u1: 12.3, u2: 18.0 });
    expect(result.data[1]).toEqual({ date: "Feb '25", u1: 11.5, u2: 17.2 });
  });

  it('carries forward last known value when a member has no entry on a date', () => {
    const history = [
      makeEntry('u1', 12.3, '2025-01-15', '1'),
      makeEntry('u2', 18.0, '2025-01-15', '2'),
      makeEntry('u1', 11.5, '2025-02-15', '3'),
    ];

    const result = computeHandicapTrends(history, members);

    expect(result.data).toHaveLength(2);
    expect(result.data[1]).toEqual({ date: "Feb '25", u1: 11.5, u2: 18.0 });
  });

  it('only includes members with history entries in activeMemberIds', () => {
    const history = [
      makeEntry('u1', 12.3, '2025-01-15', '1'),
      makeEntry('u2', 18.0, '2025-01-15', '2'),
    ];

    const result = computeHandicapTrends(history, members);

    expect(result.activeMemberIds).toEqual(['u1', 'u2']);
    expect(result.activeMemberIds).not.toContain('u3');
  });

  it('sorts dates chronologically', () => {
    const history = [
      makeEntry('u1', 10.0, '2025-03-01', '1'),
      makeEntry('u1', 12.0, '2025-01-01', '2'),
      makeEntry('u1', 11.0, '2025-02-01', '3'),
    ];

    const result = computeHandicapTrends(history, members);

    expect(result.data.map((d) => d.date)).toEqual(["Jan '25", "Feb '25", "Mar '25"]);
    expect(result.data[0].u1).toBe(12.0);
    expect(result.data[1].u1).toBe(11.0);
    expect(result.data[2].u1).toBe(10.0);
  });
});
