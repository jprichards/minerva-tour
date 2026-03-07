import { describe, it, expect } from 'vitest';

/**
 * Unit tests for the data mapping logic used when copying tee times.
 * These test the shape of score rows that should be inserted.
 */

interface CopyScoreInput {
  userId: string;
  courseId: string;
  eventId: string | null;
  teeTime: string | null;
  submittedBy: string;
}

function buildCopyScoreRow(input: CopyScoreInput) {
  return {
    user_id: input.userId,
    course_id: input.courseId,
    event_id: input.eventId,
    tee_time: input.teeTime,
    gross_score: null,
    holes_played: null,
    is_complete: false,
    course_handicap: null,
    net_score: null,
    net_strokes_over_par: null,
    submitted_by: input.submittedBy,
  };
}

function findDuplicateUserIds(
  selectedIds: string[],
  existingUserIds: string[]
): { toInsert: string[]; duplicates: string[] } {
  const existing = new Set(existingUserIds);
  const toInsert: string[] = [];
  const duplicates: string[] = [];
  for (const id of selectedIds) {
    if (existing.has(id)) {
      duplicates.push(id);
    } else {
      toInsert.push(id);
    }
  }
  return { toInsert, duplicates };
}

describe('buildCopyScoreRow', () => {
  it('creates a tee-time-only score row with null score fields', () => {
    const row = buildCopyScoreRow({
      userId: 'user-2',
      courseId: 'course-1',
      eventId: 'event-1',
      teeTime: '2026-03-07T10:00',
      submittedBy: 'user-1',
    });

    expect(row.user_id).toBe('user-2');
    expect(row.course_id).toBe('course-1');
    expect(row.event_id).toBe('event-1');
    expect(row.tee_time).toBe('2026-03-07T10:00');
    expect(row.is_complete).toBe(false);
    expect(row.gross_score).toBeNull();
    expect(row.holes_played).toBeNull();
    expect(row.course_handicap).toBeNull();
    expect(row.net_score).toBeNull();
    expect(row.net_strokes_over_par).toBeNull();
    expect(row.submitted_by).toBe('user-1');
  });

  it('handles null event_id and null tee_time', () => {
    const row = buildCopyScoreRow({
      userId: 'user-3',
      courseId: 'course-2',
      eventId: null,
      teeTime: null,
      submittedBy: 'user-1',
    });

    expect(row.event_id).toBeNull();
    expect(row.tee_time).toBeNull();
    expect(row.is_complete).toBe(false);
  });

  it('maps multiple users to separate rows', () => {
    const userIds = ['user-2', 'user-3', 'user-4'];
    const rows = userIds.map((uid) =>
      buildCopyScoreRow({
        userId: uid,
        courseId: 'course-1',
        eventId: 'event-1',
        teeTime: '2026-03-07T10:00',
        submittedBy: 'user-1',
      })
    );

    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.user_id)).toEqual(['user-2', 'user-3', 'user-4']);
    rows.forEach((r) => {
      expect(r.course_id).toBe('course-1');
      expect(r.is_complete).toBe(false);
      expect(r.gross_score).toBeNull();
    });
  });
});

describe('findDuplicateUserIds', () => {
  it('separates already-existing user IDs from new ones', () => {
    const result = findDuplicateUserIds(
      ['user-2', 'user-3', 'user-4'],
      ['user-3']
    );

    expect(result.toInsert).toEqual(['user-2', 'user-4']);
    expect(result.duplicates).toEqual(['user-3']);
  });

  it('returns all as toInsert when no duplicates', () => {
    const result = findDuplicateUserIds(
      ['user-2', 'user-3'],
      []
    );

    expect(result.toInsert).toEqual(['user-2', 'user-3']);
    expect(result.duplicates).toEqual([]);
  });

  it('returns all as duplicates when all exist', () => {
    const result = findDuplicateUserIds(
      ['user-2', 'user-3'],
      ['user-2', 'user-3']
    );

    expect(result.toInsert).toEqual([]);
    expect(result.duplicates).toEqual(['user-2', 'user-3']);
  });

  it('handles empty selection', () => {
    const result = findDuplicateUserIds([], ['user-2']);
    expect(result.toInsert).toEqual([]);
    expect(result.duplicates).toEqual([]);
  });
});
