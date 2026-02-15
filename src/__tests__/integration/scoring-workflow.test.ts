import { describe, it, expect } from 'vitest';
import {
  calculateCourseHandicap,
  calculateNetScore,
  calculateRegularEventPoints,
  calculateMajorEventPoints,
  formatNetScore,
} from '@/lib/scoring';

/**
 * Integration tests that simulate a full scoring workflow:
 * multiple players in an event, scoring, ranking, and points.
 */
describe('Full event scoring workflow', () => {
  // Simulate a regular event with 5 players on the same course
  const course = { slope: 130, rating: 71.5, par: 72, maxHoles: 18 };

  const players = [
    { name: 'Alice', handicapIndex: 10.0, grossScore: 85 },
    { name: 'Bob', handicapIndex: 15.0, grossScore: 90 },
    { name: 'Charlie', handicapIndex: 5.0, grossScore: 78 },
    { name: 'Diana', handicapIndex: 20.0, grossScore: 95 },
    { name: 'Eve', handicapIndex: 12.0, grossScore: 87 },
  ];

  it('calculates net scores for all players', () => {
    const results = players.map((p) => {
      const net = calculateNetScore(
        p.grossScore,
        p.handicapIndex,
        course.slope,
        course.rating,
        course.par,
        18,
        course.maxHoles
      );
      return { name: p.name, ...net };
    });

    // Verify all results have expected shape
    results.forEach((r) => {
      expect(r.courseHandicap).toBeTypeOf('number');
      expect(r.netScore).toBeTypeOf('number');
      expect(r.netStrokesOverPar).toBeTypeOf('number');
      expect(r.isPartial).toBe(false);
    });

    // Net score should always be gross - course handicap
    results.forEach((r, i) => {
      expect(r.netScore).toBe(players[i].grossScore - r.courseHandicap);
    });
  });

  it('ranks players by net strokes over par', () => {
    const results = players.map((p) => {
      const net = calculateNetScore(
        p.grossScore,
        p.handicapIndex,
        course.slope,
        course.rating,
        course.par,
        18,
        course.maxHoles
      );
      return { name: p.name, netStrokesOverPar: net.netStrokesOverPar };
    });

    // Sort by net strokes over par (ascending = best first)
    const ranked = [...results].sort((a, b) => a.netStrokesOverPar - b.netStrokesOverPar);

    // Rankings should be consistent
    for (let i = 0; i < ranked.length - 1; i++) {
      expect(ranked[i].netStrokesOverPar).toBeLessThanOrEqual(ranked[i + 1].netStrokesOverPar);
    }
  });

  it('awards correct regular event points based on ranking', () => {
    const results = players.map((p) => {
      const net = calculateNetScore(
        p.grossScore,
        p.handicapIndex,
        course.slope,
        course.rating,
        course.par,
        18,
        course.maxHoles
      );
      return { name: p.name, netStrokesOverPar: net.netStrokesOverPar };
    });

    const ranked = [...results].sort((a, b) => a.netStrokesOverPar - b.netStrokesOverPar);
    const numParticipants = ranked.length;

    const pointsAwarded = ranked.map((r, idx) => ({
      ...r,
      points: calculateRegularEventPoints(numParticipants, idx + 1),
    }));

    // First place gets num participants points
    expect(pointsAwarded[0].points).toBe(numParticipants);
    // Last place gets 1
    expect(pointsAwarded[numParticipants - 1].points).toBe(1);
    // Points descend by 1 each place
    for (let i = 0; i < pointsAwarded.length - 1; i++) {
      expect(pointsAwarded[i].points - pointsAwarded[i + 1].points).toBe(1);
    }
  });

  it('awards correct major event points', () => {
    const numParticipants = 5;
    const firstPlace = calculateMajorEventPoints(numParticipants, 1);
    // Min 10 for 5 players (5 * 1.33 = 6.65 < 10)
    expect(firstPlace).toBe(10);

    // 2nd = 10 - 3 = 7
    expect(calculateMajorEventPoints(numParticipants, 2)).toBe(7);
    // 3rd = 7 - 2 = 5
    expect(calculateMajorEventPoints(numParticipants, 3)).toBe(5);
    // 4th = 5 - 1 = 4
    expect(calculateMajorEventPoints(numParticipants, 4)).toBe(4);
    // 5th = 4 - 1 = 3
    expect(calculateMajorEventPoints(numParticipants, 5)).toBe(3);
  });

  it('formats all net scores correctly for display', () => {
    expect(formatNetScore(0)).toBe('E');
    expect(formatNetScore(3)).toBe('+3');
    expect(formatNetScore(-2)).toBe('-2');
  });
});

describe('Partial round scoring workflow', () => {
  it('correctly handles 9-hole partial on 18-hole course', () => {
    // Player with 15.0 handicap plays 9 holes on an 18-hole course
    const result = calculateNetScore(45, 15.0, 125, 71.0, 72, 9, 18);
    expect(result.isPartial).toBe(true);
    // Course handicap should be roughly half of full
    const fullHandicap = calculateCourseHandicap(15.0, 125);
    expect(result.courseHandicap).toBeLessThanOrEqual(fullHandicap);
    expect(result.courseHandicap).toBeGreaterThan(0);
  });

  it('correctly handles full 9-hole course', () => {
    // 9 of 9 is not partial
    const result = calculateNetScore(42, 15.0, 120, 35.5, 36, 9, 9);
    expect(result.isPartial).toBe(false);
  });
});

describe('Season points accumulation', () => {
  it('accumulates points across multiple events', () => {
    // Simulate 3 events, 3 players each
    const events = [
      { isMajor: false, rankings: ['Alice', 'Bob', 'Charlie'] },
      { isMajor: true, rankings: ['Bob', 'Alice', 'Charlie'] },
      { isMajor: false, rankings: ['Charlie', 'Alice', 'Bob'] },
    ];

    const totals: Record<string, number> = { Alice: 0, Bob: 0, Charlie: 0 };

    for (const event of events) {
      const n = event.rankings.length;
      event.rankings.forEach((name, idx) => {
        const points = event.isMajor
          ? calculateMajorEventPoints(n, idx + 1)
          : calculateRegularEventPoints(n, idx + 1);
        totals[name] += points;
      });
    }

    // All players should have points
    expect(totals['Alice']).toBeGreaterThan(0);
    expect(totals['Bob']).toBeGreaterThan(0);
    expect(totals['Charlie']).toBeGreaterThan(0);

    // Major event gives more points, so Bob (1st in major) should have good total
    // Regular 1st = 3, Major 1st = 10 (min for 3 players)
    // Alice: 3 + 7 + 2 = 12
    // Bob: 2 + 10 + 1 = 13
    // Charlie: 1 + 5 + 3 = 9
    expect(totals['Bob']).toBeGreaterThan(totals['Charlie']);
  });
});
