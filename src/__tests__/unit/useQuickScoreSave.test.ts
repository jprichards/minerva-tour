import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Score } from '@/types/database';

const { eqMock, updateMock, notifySlackMock } = vi.hoisted(() => {
  const eqMock = vi.fn().mockResolvedValue({ error: null });
  const updateMock = vi.fn().mockReturnValue({ eq: eqMock });
  const notifySlackMock = vi.fn();
  return { eqMock, updateMock, notifySlackMock };
});

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: () => ({ update: updateMock }),
  }),
}));

vi.mock('@/lib/slack-notify', () => ({
  notifySlack: notifySlackMock,
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn().mockResolvedValue(undefined),
}));

import { useQuickScoreSave } from '@/lib/hooks/useQuickScoreSave';

function makeScore(overrides: Partial<Score> = {}): Score {
  return {
    id: 'score-1',
    user_id: 'user-1',
    event_id: 'event-1',
    course_id: 'course-1',
    tee_time: '2026-03-06T10:00:00',
    gross_score: null,
    holes_played: null,
    is_complete: false,
    course_handicap: null,
    net_score: null,
    net_strokes_over_par: null,
    points_awarded: null,
    handicap_index_used: null,
    combined_with_score_id: null,
    is_retroactive: false,
    submitted_by: null,
    created_at: '2026-03-06T10:00:00',
    updated_at: '2026-03-06T10:00:00',
    course: {
      id: 'course-1',
      course_name: 'Pine Valley',
      tee_name: 'White',
      type: '18_holes',
      rating: 72.1,
      slope: 130,
      par: 72,
      created_by: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      updated_by: null,
    },
    user: {
      id: 'user-1',
      full_name: 'John Smith',
      email: 'john@test.com',
      role: 'member',
      handicap_index: 15.0,
      ghin_number: null,
      profile_picture_url: null,
      is_commissioner: false,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    } as Score['user'],
    event: {
      id: 'event-1',
      season_id: 'season-1',
      event_number: 1,
      name: 'Event 1',
      start_date: '2026-03-06',
      end_date: '2026-03-08',
      holes: 18,
      is_major: false,
      is_playoff: false,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    },
    ...overrides,
  } as unknown as Score;
}

describe('useQuickScoreSave', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not fire DB save immediately on scheduleUpdate', () => {
    const score = makeScore();
    const { result } = renderHook(() => useQuickScoreSave({ score }));

    act(() => {
      result.current.scheduleUpdate({ grossToPar: 1, holesPlayed: 5 });
    });

    expect(updateMock).not.toHaveBeenCalled();
  });

  it('fires DB save after 800ms debounce', async () => {
    const score = makeScore();
    const { result } = renderHook(() => useQuickScoreSave({ score }));

    act(() => {
      result.current.scheduleUpdate({ grossToPar: 3, holesPlayed: 9 });
    });

    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    const updatePayload = updateMock.mock.calls[0][0];
    expect(updatePayload.gross_score).toBe(39); // par 72, 9 of 18 → partial par 36, +3 = 39
    expect(updatePayload.holes_played).toBe(9);
    expect(updatePayload.is_complete).toBe(false);
  });

  it('batches rapid taps into a single DB write', async () => {
    const score = makeScore();
    const { result } = renderHook(() => useQuickScoreSave({ score }));

    act(() => {
      result.current.scheduleUpdate({ grossToPar: 1, holesPlayed: 5 });
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    act(() => {
      result.current.scheduleUpdate({ grossToPar: 2, holesPlayed: 5 });
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    act(() => {
      result.current.scheduleUpdate({ grossToPar: 3, holesPlayed: 5 });
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    act(() => {
      result.current.scheduleUpdate({ grossToPar: 4, holesPlayed: 5 });
    });

    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    const updatePayload = updateMock.mock.calls[0][0];
    // partial par for 5 of 18 = round(72*5/18) = 20, +4 = 24
    expect(updatePayload.gross_score).toBe(24);
  });

  it('does not fire Slack notification at 800ms', async () => {
    const score = makeScore();
    const { result } = renderHook(() => useQuickScoreSave({ score }));

    act(() => {
      result.current.scheduleUpdate({ grossToPar: 1, holesPlayed: 5 });
    });

    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(notifySlackMock).not.toHaveBeenCalled();
  });

  it('fires Slack notification after 20s debounce', async () => {
    const score = makeScore();
    const { result } = renderHook(() => useQuickScoreSave({ score }));

    act(() => {
      result.current.scheduleUpdate({ grossToPar: 2, holesPlayed: 9 });
    });

    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });

    expect(notifySlackMock).toHaveBeenCalledTimes(1);
    const payload = notifySlackMock.mock.calls[0][0];
    expect(payload.event_type).toBe('score_in_progress');
    expect(payload.gross_score).toBe(38); // partial par 36 + 2
    expect(payload.holes_played).toBe(9);
  });

  it('resets Slack debounce on subsequent taps', async () => {
    const score = makeScore();
    const { result } = renderHook(() => useQuickScoreSave({ score }));

    act(() => {
      result.current.scheduleUpdate({ grossToPar: 1, holesPlayed: 5 });
    });

    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(notifySlackMock).not.toHaveBeenCalled();

    act(() => {
      result.current.scheduleUpdate({ grossToPar: 2, holesPlayed: 5 });
    });

    await act(async () => {
      vi.advanceTimersByTime(15_000);
    });
    expect(notifySlackMock).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(5_000);
    });
    expect(notifySlackMock).toHaveBeenCalledTimes(1);
  });

  it('flushes pending DB save and Slack on unmount', () => {
    const score = makeScore();
    const { result, unmount } = renderHook(() => useQuickScoreSave({ score }));

    act(() => {
      result.current.scheduleUpdate({ grossToPar: 5, holesPlayed: 10 });
    });

    expect(updateMock).not.toHaveBeenCalled();
    expect(notifySlackMock).not.toHaveBeenCalled();

    unmount();

    expect(updateMock).toHaveBeenCalledTimes(1);
    expect(notifySlackMock).toHaveBeenCalledTimes(1);
  });

  it('uses round_complete event type when holes = max', async () => {
    const score = makeScore();
    const { result } = renderHook(() => useQuickScoreSave({ score }));

    act(() => {
      result.current.scheduleUpdate({ grossToPar: 5, holesPlayed: 18 });
    });

    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });

    expect(notifySlackMock).toHaveBeenCalledTimes(1);
    expect(notifySlackMock.mock.calls[0][0].event_type).toBe('round_complete');
  });

  it('saves nulls to DB when holesPlayed is 0 (not started)', async () => {
    const score = makeScore();
    const { result } = renderHook(() => useQuickScoreSave({ score }));

    act(() => {
      result.current.scheduleUpdate({ grossToPar: 0, holesPlayed: 0 });
    });

    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(updateMock).toHaveBeenCalledTimes(1);
    const payload = updateMock.mock.calls[0][0];
    expect(payload.gross_score).toBeNull();
    expect(payload.holes_played).toBeNull();
    expect(payload.is_complete).toBe(false);
  });

  it('skips Slack notification when holesPlayed is 0', async () => {
    const score = makeScore();
    const { result } = renderHook(() => useQuickScoreSave({ score }));

    act(() => {
      result.current.scheduleUpdate({ grossToPar: 0, holesPlayed: 0 });
    });

    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });

    expect(notifySlackMock).not.toHaveBeenCalled();
  });

  it('calls onSaved callback after successful DB write', async () => {
    const onSaved = vi.fn();
    const score = makeScore();
    const { result } = renderHook(() => useQuickScoreSave({ score, onSaved }));

    act(() => {
      result.current.scheduleUpdate({ grossToPar: 1, holesPlayed: 5 });
    });

    await act(async () => {
      vi.advanceTimersByTime(800);
    });

    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});
