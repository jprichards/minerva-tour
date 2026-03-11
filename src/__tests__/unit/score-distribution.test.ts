import { describe, it, expect } from 'vitest';
import { computeDistribution } from '@/app/(protected)/stats/components/ScoreDistribution';
import type { Score } from '@/types/database';

const makeScore = (userId: string, nop: number, id: string): Score => ({
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
});

describe('computeDistribution', () => {
  it('returns empty array when no scores', () => {
    expect(computeDistribution([], 'alice')).toEqual([]);
  });

  it('bins scores by net strokes over par', () => {
    const scores = [
      makeScore('alice', -2, 's1'),
      makeScore('bob', -2, 's2'),
      makeScore('charlie', 0, 's3'),
      makeScore('alice', 3, 's4'),
      makeScore('bob', 3, 's5'),
      makeScore('bob', 3, 's6'),
    ];

    const result = computeDistribution(scores);

    const bin_neg2 = result.find((b) => b.netValue === -2);
    expect(bin_neg2?.total).toBe(2);

    const bin_0 = result.find((b) => b.netValue === 0);
    expect(bin_0?.total).toBe(1);
    expect(bin_0?.label).toBe('E');

    const bin_3 = result.find((b) => b.netValue === 3);
    expect(bin_3?.total).toBe(3);
    expect(bin_3?.label).toBe('+3');
  });

  it('tracks current user scores separately', () => {
    const scores = [
      makeScore('alice', 1, 's1'),
      makeScore('bob', 1, 's2'),
      makeScore('alice', 1, 's3'),
    ];

    const result = computeDistribution(scores, 'alice');

    const bin = result.find((b) => b.netValue === 1);
    expect(bin?.total).toBe(3);
    expect(bin?.mine).toBe(2);
  });

  it('includes extreme scores without clamping', () => {
    const scores = [
      makeScore('alice', -10, 's1'),
      makeScore('bob', 25, 's2'),
    ];

    const result = computeDistribution(scores);

    const minBin = result.find((b) => b.netValue === -10);
    expect(minBin?.total).toBe(1);
    expect(minBin?.label).toBe('-10');

    const maxBin = result.find((b) => b.netValue === 25);
    expect(maxBin?.total).toBe(1);
    expect(maxBin?.label).toBe('+25');
  });

  it('spans the full range from min to max score', () => {
    const scores = [
      makeScore('alice', -2, 's1'),
      makeScore('bob', 5, 's2'),
    ];

    const result = computeDistribution(scores);

    expect(result[0].netValue).toBe(-2);
    expect(result[result.length - 1].netValue).toBe(5);

    const evenBin = result.find((b) => b.netValue === 0);
    expect(evenBin).toBeDefined();
    expect(evenBin?.total).toBe(0);
  });

  it('labels negative scores without plus sign', () => {
    const scores = [makeScore('alice', -3, 's1')];

    const result = computeDistribution(scores);
    const bin = result.find((b) => b.netValue === -3);
    expect(bin?.label).toBe('-3');
  });

  it('includes even par bin in range even if no one scored it', () => {
    const scores = [
      makeScore('alice', -1, 's1'),
      makeScore('bob', 2, 's2'),
    ];

    const result = computeDistribution(scores);
    const evenBin = result.find((b) => b.netValue === 0);
    expect(evenBin).toBeDefined();
    expect(evenBin?.total).toBe(0);
  });

  it('omits bins with zero counts except even par', () => {
    const scores = [
      makeScore('alice', 2, 's1'),
      makeScore('bob', 4, 's2'),
    ];

    const result = computeDistribution(scores);
    const bin3 = result.find((b) => b.netValue === 3);
    expect(bin3).toBeUndefined();
  });
});
