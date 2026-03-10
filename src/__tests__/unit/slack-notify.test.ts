import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { SlackNotifyPayload } from '@/types/database';

describe('notifySlack', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends a POST request to /api/slack/notify', async () => {
    // Dynamic import to pick up the mocked fetch
    const { notifySlack } = await import('@/lib/slack-notify');

    const payload: SlackNotifyPayload = {
      event_type: 'round_complete',
      player_name: 'John Smith',
      course_name: 'Pine Valley',
      tee_name: 'White',
      par: 72,
      rating: 73.5,
      gross_score: 85,
      net_strokes_over_par: 1,
      holes_played: 18,
      max_holes: 18,
    };

    notifySlack(payload);

    // Give microtask a tick
    await new Promise((r) => setTimeout(r, 0));

    expect(global.fetch).toHaveBeenCalledWith('/api/slack/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  });

  it('includes course rating in the payload for scratch score accuracy', async () => {
    const { notifySlack } = await import('@/lib/slack-notify');

    const payload: SlackNotifyPayload = {
      event_type: 'round_complete',
      player_name: 'Devin Blankenship',
      course_name: 'Atlanta National',
      tee_name: 'Blue',
      par: 72,
      rating: 73.5,
      gross_score: 85,
      net_strokes_over_par: 0,
      holes_played: 18,
      max_holes: 18,
    };

    notifySlack(payload);
    await new Promise((r) => setTimeout(r, 0));

    const sentBody = JSON.parse((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body);
    expect(sentBody.rating).toBe(73.5);
    expect(sentBody.par).toBe(72);
  });

  it('silently catches fetch errors', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const { notifySlack } = await import('@/lib/slack-notify');

    // Should not throw
    expect(() => {
      notifySlack({
        event_type: 'tee_time',
        player_name: 'Test',
        course_name: 'Test Course',
        tee_name: 'White',
        par: 72,
      });
    }).not.toThrow();
  });

  it('does not return a promise that needs to be awaited', async () => {
    const { notifySlack } = await import('@/lib/slack-notify');

    const result = notifySlack({
      event_type: 'tee_time',
      player_name: 'Test',
      course_name: 'Test Course',
      tee_name: 'White',
      par: 72,
    });

    expect(result).toBeUndefined();
  });
});
