import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the server Supabase client
const mockSupabaseServer = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabaseServer),
}));

// Mock global fetch for Slack API calls
const originalFetch = global.fetch;
const mockFetch = vi.fn();

// Mock the slack formatter
vi.mock('@/lib/slack', () => ({
  formatSlackMessage: vi.fn().mockReturnValue({
    text: 'Test message',
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Test' } }],
  }),
}));

/**
 * Create a chainable mock that supports all common Supabase query methods.
 * `finalValue` is returned by terminal methods (.single(), or the chain itself when awaited).
 */
function mockChain(finalValue: unknown) {
  const chain: Record<string, any> = {};
  const methods = ['select', 'eq', 'in', 'lte', 'gte', 'order', 'limit'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue(finalValue);
  // When the chain is awaited directly (no .single()), resolve with finalValue
  chain.then = (resolve: (v: unknown) => void) => Promise.resolve(finalValue).then(resolve);
  return chain;
}

/**
 * Set up mockSupabaseServer.from to return different chains per table name.
 */
function setupFromMock(tableChains: Record<string, ReturnType<typeof mockChain>>) {
  mockSupabaseServer.from.mockImplementation((table: string) => {
    return tableChains[table] || mockChain({ data: null, error: null });
  });
}

describe('Slack API Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = mockFetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  describe('POST /api/slack/channels', () => {
    it('returns 401 when not authenticated', async () => {
      mockSupabaseServer.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const { POST } = await import('@/app/api/slack/channels/route');
      const req = new Request('http://localhost/api/slack/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_token: 'xoxb-test' }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(401);
    });

    it('returns 403 when user is not admin', async () => {
      mockSupabaseServer.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });

      const profileChain = mockChain({ data: { role: 'member' }, error: null });
      mockSupabaseServer.from.mockReturnValue(profileChain);

      const { POST } = await import('@/app/api/slack/channels/route');
      const req = new Request('http://localhost/api/slack/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_token: 'xoxb-test' }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(403);
    });

    it('returns 400 when bot_token is missing', async () => {
      mockSupabaseServer.auth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-1' } },
        error: null,
      });

      const profileChain = mockChain({ data: { role: 'admin' }, error: null });
      mockSupabaseServer.from.mockReturnValue(profileChain);

      const { POST } = await import('@/app/api/slack/channels/route');
      const req = new Request('http://localhost/api/slack/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(400);
    });

    it('returns channels on success', async () => {
      mockSupabaseServer.auth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-1' } },
        error: null,
      });

      const profileChain = mockChain({ data: { role: 'admin' }, error: null });
      mockSupabaseServer.from.mockReturnValue(profileChain);

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({
          ok: true,
          channels: [
            { id: 'C001', name: 'general' },
            { id: 'C002', name: 'minerva-tour' },
          ],
        }),
      });

      const { POST } = await import('@/app/api/slack/channels/route');
      const req = new Request('http://localhost/api/slack/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_token: 'xoxb-valid' }),
      });

      const res = await POST(req as any);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.channels).toHaveLength(2);
      expect(data.channels[0].name).toBe('general');
    });
  });

  describe('POST /api/slack/notify', () => {
    it('returns 401 when not authenticated', async () => {
      mockSupabaseServer.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const { POST } = await import('@/app/api/slack/notify/route');
      const req = new Request('http://localhost/api/slack/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event_type: 'round_complete', player_name: 'Test' }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(401);
    });

    it('returns ok:false when no slack config exists', async () => {
      mockSupabaseServer.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });

      setupFromMock({
        app_settings: mockChain({ data: null, error: null }),
      });

      const { POST } = await import('@/app/api/slack/notify/route');
      const req = new Request('http://localhost/api/slack/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'round_complete',
          player_name: 'Test',
          course_name: 'Test Course',
          tee_name: 'White',
          par: 72,
        }),
      });

      const res = await POST(req as any);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(false);
      expect(data.reason).toBe('no_config');
    });

    it('returns ok:false when event type is disabled', async () => {
      mockSupabaseServer.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });

      setupFromMock({
        app_settings: mockChain({
          data: {
            value: {
              bot_token: 'xoxb-test',
              channel_id: 'C001',
              channel_name: '#test',
              events: {
                tee_time: false,
                score_in_progress: true,
                round_complete: true,
                score_edit: true,
                retroactive: true,
              },
            },
          },
          error: null,
        }),
      });

      const { POST } = await import('@/app/api/slack/notify/route');
      const req = new Request('http://localhost/api/slack/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'tee_time',
          player_name: 'Test',
          course_name: 'Test Course',
          tee_name: 'White',
          par: 72,
        }),
      });

      const res = await POST(req as any);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(false);
      expect(data.reason).toBe('event_disabled');
    });

    it('posts to Slack when event is enabled', async () => {
      mockSupabaseServer.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });

      setupFromMock({
        app_settings: mockChain({
          data: {
            value: {
              bot_token: 'xoxb-test',
              channel_id: 'C001',
              channel_name: '#test',
              events: {
                tee_time: true,
                score_in_progress: true,
                round_complete: true,
                score_edit: true,
                retroactive: true,
              },
            },
          },
          error: null,
        }),
        seasons: mockChain({ data: [{ id: 'season-1' }], error: null }),
        events: mockChain({ data: [{ id: 'event-1', is_major: false }], error: null }),
        scores: mockChain({
          data: [
            {
              user_id: 'user-1',
              gross_score: 85,
              net_strokes_over_par: 1,
              holes_played: 18,
              is_complete: true,
              course: { rating: 72, par: 72, type: '18_holes' },
            },
            {
              user_id: 'user-2',
              gross_score: 90,
              net_strokes_over_par: 4,
              holes_played: 18,
              is_complete: true,
              course: { rating: 72, par: 72, type: '18_holes' },
            },
          ],
          error: null,
        }),
      });

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: true }),
      });

      const { POST } = await import('@/app/api/slack/notify/route');
      const req = new Request('http://localhost/api/slack/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'round_complete',
          player_name: 'John Smith',
          course_name: 'Pine Valley',
          tee_name: 'White',
          par: 72,
          gross_score: 85,
          net_strokes_over_par: 1,
          holes_played: 18,
          max_holes: 18,
          is_complete: true,
        }),
      });

      const res = await POST(req as any);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);

      expect(mockFetch).toHaveBeenCalledWith(
        'https://slack.com/api/chat.postMessage',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer xoxb-test',
          }),
        })
      );
    });

    it('handles Slack API failure gracefully', async () => {
      mockSupabaseServer.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });

      setupFromMock({
        app_settings: mockChain({
          data: {
            value: {
              bot_token: 'xoxb-test',
              channel_id: 'C001',
              channel_name: '#test',
              events: { round_complete: true },
            },
          },
          error: null,
        }),
        seasons: mockChain({ data: [{ id: 'season-1' }], error: null }),
        events: mockChain({ data: [{ id: 'event-1', is_major: false }], error: null }),
        scores: mockChain({ data: [], error: null }),
      });

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: false, error: 'channel_not_found' }),
      });

      const { POST } = await import('@/app/api/slack/notify/route');
      const req = new Request('http://localhost/api/slack/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'round_complete',
          player_name: 'John',
          course_name: 'Test',
          tee_name: 'White',
          par: 72,
        }),
      });

      const res = await POST(req as any);
      const data = await res.json();

      // Still returns 200 (best-effort)
      expect(res.status).toBe(200);
      expect(data.ok).toBe(false);
      expect(data.reason).toBe('channel_not_found');
    });
  });

  describe('POST /api/slack/test', () => {
    it('returns 401 when not authenticated', async () => {
      mockSupabaseServer.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: null,
      });

      const { POST } = await import('@/app/api/slack/test/route');
      const req = new Request('http://localhost/api/slack/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_token: 'xoxb-test', channel_id: 'C001' }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(401);
    });

    it('returns 400 when required fields are missing', async () => {
      mockSupabaseServer.auth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-1' } },
        error: null,
      });

      const profileChain = mockChain({ data: { role: 'admin' }, error: null });
      mockSupabaseServer.from.mockReturnValue(profileChain);

      const { POST } = await import('@/app/api/slack/test/route');
      const req = new Request('http://localhost/api/slack/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_token: 'xoxb-test' }),
      });

      const res = await POST(req as any);
      expect(res.status).toBe(400);
    });

    it('returns ok:true when test message is sent', async () => {
      mockSupabaseServer.auth.getUser.mockResolvedValue({
        data: { user: { id: 'admin-1' } },
        error: null,
      });

      const profileChain = mockChain({ data: { role: 'admin' }, error: null });
      mockSupabaseServer.from.mockReturnValue(profileChain);

      mockFetch.mockResolvedValueOnce({
        json: () => Promise.resolve({ ok: true }),
      });

      const { POST } = await import('@/app/api/slack/test/route');
      const req = new Request('http://localhost/api/slack/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bot_token: 'xoxb-test', channel_id: 'C001' }),
      });

      const res = await POST(req as any);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
    });
  });
});
