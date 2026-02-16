import { describe, it, expect } from 'vitest';

/**
 * Tests for the handicap trend calculation utility.
 * Given a current handicap and a previous handicap, determine:
 * - 'improved' (current < previous) → green down arrow
 * - 'worsened' (current > previous) → red up arrow
 * - 'unchanged' (current === previous or no previous) → gray dash
 */

// Import the function we'll create
import { getHandicapTrend } from '@/lib/handicap-trend';

describe('getHandicapTrend', () => {
  it('returns "improved" when current handicap is lower than previous', () => {
    expect(getHandicapTrend(10.5, 12.0)).toBe('improved');
  });

  it('returns "improved" even for small improvements', () => {
    expect(getHandicapTrend(9.6, 9.7)).toBe('improved');
  });

  it('returns "worsened" when current handicap is higher than previous', () => {
    expect(getHandicapTrend(15.0, 12.5)).toBe('worsened');
  });

  it('returns "worsened" even for small increases', () => {
    expect(getHandicapTrend(9.8, 9.7)).toBe('worsened');
  });

  it('returns "unchanged" when current equals previous', () => {
    expect(getHandicapTrend(12.0, 12.0)).toBe('unchanged');
  });

  it('returns "unchanged" when previous is null (no history)', () => {
    expect(getHandicapTrend(12.0, null)).toBe('unchanged');
  });

  it('returns "unchanged" when previous is undefined', () => {
    expect(getHandicapTrend(12.0, undefined)).toBe('unchanged');
  });

  it('returns "unchanged" when current is null', () => {
    expect(getHandicapTrend(null, 12.0)).toBe('unchanged');
  });

  it('handles zero handicaps correctly', () => {
    expect(getHandicapTrend(0, 1.5)).toBe('improved');
    expect(getHandicapTrend(1.5, 0)).toBe('worsened');
    expect(getHandicapTrend(0, 0)).toBe('unchanged');
  });

  it('handles negative (plus) handicaps correctly', () => {
    expect(getHandicapTrend(-1.0, 0.5)).toBe('improved');
    expect(getHandicapTrend(0.5, -1.0)).toBe('worsened');
  });
});
