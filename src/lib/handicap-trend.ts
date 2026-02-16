export type HandicapTrend = 'improved' | 'worsened' | 'unchanged';

/**
 * Compare current handicap to previous handicap and return the trend.
 * - 'improved': current < previous (handicap went down — good)
 * - 'worsened': current > previous (handicap went up — bad)
 * - 'unchanged': equal or missing data
 */
export function getHandicapTrend(
  current: number | null | undefined,
  previous: number | null | undefined
): HandicapTrend {
  if (current == null || previous == null) return 'unchanged';
  if (current < previous) return 'improved';
  if (current > previous) return 'worsened';
  return 'unchanged';
}
