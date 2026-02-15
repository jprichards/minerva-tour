import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock idb-keyval
const store = new Map();
vi.mock('idb-keyval', () => ({
  get: vi.fn((key: string) => Promise.resolve(store.get(key))),
  set: vi.fn((key: string, val: unknown) => { store.set(key, val); return Promise.resolve(); }),
  del: vi.fn((key: string) => { store.delete(key); return Promise.resolve(); }),
  keys: vi.fn(() => Promise.resolve(Array.from(store.keys()))),
}));

import {
  queueScore,
  getPendingScores,
  removeFromQueue,
  getPendingCount,
  hasPendingScores,
} from '@/lib/offline/sync-queue';

describe('Offline Sync Queue', () => {
  beforeEach(() => {
    store.clear();
  });

  it('queues a score and returns an id', async () => {
    const id = await queueScore({
      user_id: 'user-1',
      course_id: 'course-1',
      event_id: 'event-1',
      gross_score: 85,
      holes_played: 18,
      is_complete: true,
      course_handicap: 12,
      net_score: 73,
      net_strokes_over_par: 1,
      is_tournament_round: false,
    });

    expect(id).toBeTruthy();
    expect(typeof id).toBe('string');
  });

  it('retrieves pending scores', async () => {
    await queueScore({
      user_id: 'user-1',
      course_id: 'course-1',
      event_id: null,
      gross_score: 90,
      holes_played: 18,
      is_complete: true,
      course_handicap: null,
      net_score: null,
      net_strokes_over_par: null,
      is_tournament_round: false,
    });

    const pending = await getPendingScores();
    expect(pending).toHaveLength(1);
    expect(pending[0].gross_score).toBe(90);
    expect(pending[0].status).toBe('pending');
  });

  it('removes a score from the queue', async () => {
    const id = await queueScore({
      user_id: 'user-1',
      course_id: 'course-1',
      event_id: null,
      gross_score: 88,
      holes_played: 18,
      is_complete: true,
      course_handicap: null,
      net_score: null,
      net_strokes_over_par: null,
      is_tournament_round: false,
    });

    await removeFromQueue(id);
    const pending = await getPendingScores();
    expect(pending).toHaveLength(0);
  });

  it('counts pending scores', async () => {
    await queueScore({
      user_id: 'user-1',
      course_id: 'c-1',
      event_id: null,
      gross_score: 80,
      holes_played: 18,
      is_complete: true,
      course_handicap: null,
      net_score: null,
      net_strokes_over_par: null,
      is_tournament_round: false,
    });

    await queueScore({
      user_id: 'user-1',
      course_id: 'c-2',
      event_id: null,
      gross_score: 95,
      holes_played: 18,
      is_complete: true,
      course_handicap: null,
      net_score: null,
      net_strokes_over_par: null,
      is_tournament_round: false,
    });

    const count = await getPendingCount();
    expect(count).toBe(2);
  });

  it('hasPendingScores returns false when empty', async () => {
    const has = await hasPendingScores();
    expect(has).toBe(false);
  });

  it('hasPendingScores returns true when scores exist', async () => {
    await queueScore({
      user_id: 'user-1',
      course_id: 'c-1',
      event_id: null,
      gross_score: 75,
      holes_played: 18,
      is_complete: true,
      course_handicap: null,
      net_score: null,
      net_strokes_over_par: null,
      is_tournament_round: false,
    });

    const has = await hasPendingScores();
    expect(has).toBe(true);
  });

  it('queued scores have correct initial status', async () => {
    await queueScore({
      user_id: 'user-1',
      course_id: 'c-1',
      event_id: null,
      gross_score: 82,
      holes_played: 9,
      is_complete: true,
      course_handicap: null,
      net_score: null,
      net_strokes_over_par: null,
      is_tournament_round: false,
    });

    const pending = await getPendingScores();
    expect(pending[0].status).toBe('pending');
    expect(pending[0].retryCount).toBe(0);
    expect(pending[0].created_at).toBeTruthy();
  });
});
