import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { formatSlackMessage } from '@/lib/slack';

const mockRpcChain: Record<string, any> = {};
const mockSupabaseServer = {
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
  rpc: vi.fn().mockReturnValue(mockRpcChain),
};

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue(mockSupabaseServer),
}));

const originalFetch = global.fetch;
const mockFetch = vi.fn();

vi.mock('@/lib/slack', () => ({
  formatSlackMessage: vi.fn().mockReturnValue({
    text: 'Test message',
    blocks: [{ type: 'section', text: { type: 'mrkdwn', text: 'Test' } }],
  }),
}));

vi.mock('@/lib/chirps-ai', () => ({
  generateChirps: vi.fn().mockResolvedValue([]),
  CHIRPS_QUEUE_TARGET: 10,
}));

const mockFormatSlackMessage = vi.mocked(formatSlackMessage);

vi.mock('@/lib/feature-flags', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/feature-flags')>();
  return {
    ...actual,
    isFeatureEnabled: vi.fn().mockResolvedValue(false),
  };
});

import { isFeatureEnabled } from '@/lib/feature-flags';
const mockIsFeatureEnabled = vi.mocked(isFeatureEnabled);

function mockChain(finalValue: unknown) {
  const chain: Record<string, any> = {};
  const methods = ['select', 'eq', 'neq', 'in', 'not', 'is', 'lte', 'gte', 'order', 'limit', 'update', 'insert'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockResolvedValue(finalValue);
  chain.maybeSingle = vi.fn().mockResolvedValue(finalValue);
  chain.then = (resolve: (v: unknown) => void) => Promise.resolve(finalValue).then(resolve);
  return chain;
}

function setupFromMock(tableChains: Record<string, ReturnType<typeof mockChain>>) {
  mockSupabaseServer.from.mockImplementation((table: string) => {
    return tableChains[table] || mockChain({ data: null, error: null });
  });
}

const baseSlackConfig = {
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
};

describe('Chirps Queue Consumption in Slack Notify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    global.fetch = mockFetch;
    mockIsFeatureEnabled.mockResolvedValue(false);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('skips chirps when trigger is round_complete and event is score_in_progress', async () => {
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    const appSettingsChainSlack = mockChain({
      data: { value: baseSlackConfig },
      error: null,
    });
    const appSettingsChainChirpConfig = mockChain({
      data: { value: { trigger: 'round_complete' } },
      error: null,
    });

    let appSettingsCallCount = 0;
    const appSettingsChain: Record<string, any> = {};
    const methods = ['select', 'eq', 'neq', 'in', 'not', 'is', 'lte', 'gte', 'order', 'limit', 'update', 'insert'];
    for (const m of methods) {
      appSettingsChain[m] = vi.fn().mockReturnValue(appSettingsChain);
    }
    appSettingsChain.single = vi.fn().mockImplementation(() => {
      appSettingsCallCount++;
      if (appSettingsCallCount === 1) {
        return Promise.resolve({ data: { value: baseSlackConfig }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    appSettingsChain.maybeSingle = vi.fn().mockImplementation(() => {
      appSettingsCallCount++;
      if (appSettingsCallCount === 2) {
        return Promise.resolve({ data: { value: { trigger: 'round_complete' } }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    appSettingsChain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: null, error: null }).then(resolve);

    mockSupabaseServer.from.mockImplementation((table: string) => {
      if (table === 'app_settings') return appSettingsChain;
      if (table === 'seasons') return mockChain({ data: [{ id: 'season-1' }], error: null });
      if (table === 'events') return mockChain({ data: [{ id: 'event-1', is_major: false }], error: null });
      if (table === 'scores') return mockChain({ data: [], error: null });
      return mockChain({ data: null, error: null });
    });

    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ ok: true }),
    });

    const { POST } = await import('@/app/api/slack/notify/route');
    const req = new Request('http://localhost/api/slack/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'score_in_progress',
        player_name: 'John Smith',
        course_name: 'Pine Valley',
        tee_name: 'White',
        par: 72,
        gross_score: 40,
        net_strokes_over_par: -2,
        holes_played: 9,
        max_holes: 18,
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);

    const formatCall = mockFormatSlackMessage.mock.calls[0];
    const chirpOverrideArg = formatCall[3];
    expect(chirpOverrideArg).toBeNull();
  });

  it('skips chirps when trigger is nine_holes_complete and holes_played < 9', async () => {
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    let appSettingsCallCount = 0;
    const appSettingsChain: Record<string, any> = {};
    const methods = ['select', 'eq', 'neq', 'in', 'not', 'is', 'lte', 'gte', 'order', 'limit', 'update', 'insert'];
    for (const m of methods) {
      appSettingsChain[m] = vi.fn().mockReturnValue(appSettingsChain);
    }
    appSettingsChain.single = vi.fn().mockImplementation(() => {
      appSettingsCallCount++;
      if (appSettingsCallCount === 1) {
        return Promise.resolve({ data: { value: baseSlackConfig }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    appSettingsChain.maybeSingle = vi.fn().mockImplementation(() => {
      appSettingsCallCount++;
      if (appSettingsCallCount === 2) {
        return Promise.resolve({ data: { value: { trigger: 'nine_holes_complete' } }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    appSettingsChain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: null, error: null }).then(resolve);

    mockSupabaseServer.from.mockImplementation((table: string) => {
      if (table === 'app_settings') return appSettingsChain;
      if (table === 'seasons') return mockChain({ data: [{ id: 'season-1' }], error: null });
      if (table === 'events') return mockChain({ data: [{ id: 'event-1', is_major: false }], error: null });
      if (table === 'scores') return mockChain({ data: [], error: null });
      return mockChain({ data: null, error: null });
    });

    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ ok: true }),
    });

    const { POST } = await import('@/app/api/slack/notify/route');
    const req = new Request('http://localhost/api/slack/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'score_in_progress',
        player_name: 'John Smith',
        course_name: 'Pine Valley',
        tee_name: 'White',
        par: 72,
        gross_score: 20,
        net_strokes_over_par: -1,
        holes_played: 4,
        max_holes: 18,
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);

    const fmtCall = mockFormatSlackMessage.mock.calls[0];
    expect(fmtCall[3]).toBeNull();
  });

  it('fires chirps when trigger is nine_holes_complete and holes_played >= 9 on 18-hole round', async () => {
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    mockIsFeatureEnabled.mockResolvedValue(true);

    let appSettingsCallCount = 0;
    const appSettingsChain: Record<string, any> = {};
    const chainMethods = ['select', 'eq', 'neq', 'in', 'not', 'is', 'lte', 'gte', 'order', 'limit', 'update', 'insert'];
    for (const m of chainMethods) {
      appSettingsChain[m] = vi.fn().mockReturnValue(appSettingsChain);
    }
    appSettingsChain.single = vi.fn().mockImplementation(() => {
      appSettingsCallCount++;
      if (appSettingsCallCount === 1) {
        return Promise.resolve({ data: { value: baseSlackConfig }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    appSettingsChain.maybeSingle = vi.fn().mockImplementation(() => {
      appSettingsCallCount++;
      return Promise.resolve({ data: { value: { trigger: 'nine_holes_complete' } }, error: null });
    });
    appSettingsChain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: null, error: null }).then(resolve);

    mockRpcChain.maybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'chirp-9h', template: '$first_name made the turn!' },
      error: null,
    });

    mockSupabaseServer.from.mockImplementation((table: string) => {
      if (table === 'app_settings') return appSettingsChain;
      if (table === 'seasons') return mockChain({ data: [{ id: 'season-1' }], error: null });
      if (table === 'events') return mockChain({ data: [{ id: 'event-1', is_major: false }], error: null });
      if (table === 'scores') return mockChain({ data: [], error: null });
      if (table === 'feature_flags') return mockChain({ data: { key: 'chirps-queue', enabled: true, target_user_ids: [], target_roles: [] }, error: null });
      return mockChain({ data: null, error: null });
    });

    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ ok: true }),
    });

    const { POST } = await import('@/app/api/slack/notify/route');
    const req = new Request('http://localhost/api/slack/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'score_in_progress',
        player_name: 'John Smith',
        course_name: 'Pine Valley',
        tee_name: 'White',
        par: 72,
        gross_score: 40,
        net_strokes_over_par: -2,
        holes_played: 9,
        max_holes: 18,
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);

    const fmtCall = mockFormatSlackMessage.mock.calls[0];
    expect(fmtCall[3]).toBe('John made the turn!');
  });

  it('fires chirps when trigger is nine_holes_complete on 9-hole round_complete', async () => {
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    mockIsFeatureEnabled.mockResolvedValue(true);

    let appSettingsCallCount = 0;
    const appSettingsChain: Record<string, any> = {};
    const chainMethods = ['select', 'eq', 'neq', 'in', 'not', 'is', 'lte', 'gte', 'order', 'limit', 'update', 'insert'];
    for (const m of chainMethods) {
      appSettingsChain[m] = vi.fn().mockReturnValue(appSettingsChain);
    }
    appSettingsChain.single = vi.fn().mockImplementation(() => {
      appSettingsCallCount++;
      if (appSettingsCallCount === 1) {
        return Promise.resolve({ data: { value: baseSlackConfig }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    appSettingsChain.maybeSingle = vi.fn().mockImplementation(() => {
      appSettingsCallCount++;
      return Promise.resolve({ data: { value: { trigger: 'nine_holes_complete' } }, error: null });
    });
    appSettingsChain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: null, error: null }).then(resolve);

    mockRpcChain.maybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'chirp-9h-done', template: 'Nice round $first_name!' },
      error: null,
    });

    mockSupabaseServer.from.mockImplementation((table: string) => {
      if (table === 'app_settings') return appSettingsChain;
      if (table === 'seasons') return mockChain({ data: [{ id: 'season-1' }], error: null });
      if (table === 'events') return mockChain({ data: [{ id: 'event-1', is_major: false }], error: null });
      if (table === 'scores') return mockChain({ data: [], error: null });
      if (table === 'feature_flags') return mockChain({ data: { key: 'chirps-queue', enabled: true, target_user_ids: [], target_roles: [] }, error: null });
      return mockChain({ data: null, error: null });
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
        player_name: 'Matt Davis',
        course_name: 'Short Course',
        tee_name: 'White',
        par: 36,
        gross_score: 30,
        net_strokes_over_par: -3,
        holes_played: 9,
        max_holes: 9,
        is_complete: true,
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);

    const fmtCall = mockFormatSlackMessage.mock.calls[0];
    expect(fmtCall[3]).toBe('Nice round Matt!');
  });

  it('uses top chirp from queue when chirps-queue flag is enabled', async () => {
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    mockIsFeatureEnabled.mockResolvedValue(true);

    let appSettingsCallCount = 0;
    const appSettingsChain: Record<string, any> = {};
    const chainMethods = ['select', 'eq', 'neq', 'in', 'not', 'is', 'lte', 'gte', 'order', 'limit', 'update', 'insert'];
    for (const m of chainMethods) {
      appSettingsChain[m] = vi.fn().mockReturnValue(appSettingsChain);
    }
    appSettingsChain.single = vi.fn().mockImplementation(() => {
      appSettingsCallCount++;
      if (appSettingsCallCount === 1) {
        return Promise.resolve({ data: { value: baseSlackConfig }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    appSettingsChain.maybeSingle = vi.fn().mockImplementation(() => {
      appSettingsCallCount++;
      return Promise.resolve({ data: { value: { trigger: 'all_score_updates' } }, error: null });
    });
    appSettingsChain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: null, error: null }).then(resolve);

    mockRpcChain.maybeSingle = vi.fn().mockResolvedValue({
      data: { id: 'chirp-1', template: '$first_name just crushed it at $course!' },
      error: null,
    });

    mockSupabaseServer.from.mockImplementation((table: string) => {
      if (table === 'app_settings') return appSettingsChain;
      if (table === 'seasons') return mockChain({ data: [{ id: 'season-1' }], error: null });
      if (table === 'events') return mockChain({ data: [{ id: 'event-1', is_major: false }], error: null });
      if (table === 'scores') return mockChain({ data: [], error: null });
      if (table === 'feature_flags') return mockChain({ data: { key: 'chirps-queue', enabled: true, target_user_ids: [], target_roles: [] }, error: null });
      return mockChain({ data: null, error: null });
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
        gross_score: 68,
        net_strokes_over_par: -4,
        holes_played: 18,
        max_holes: 18,
        is_complete: true,
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);

    const formatCall = mockFormatSlackMessage.mock.calls[0];
    const chirpOverrideArg = formatCall[3];
    expect(chirpOverrideArg).toBe('John just crushed it at Pine Valley!');
  });

  it('falls back to hardcoded templates when queue is empty', async () => {
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    mockIsFeatureEnabled.mockResolvedValue(true);

    let appSettingsCallCount = 0;
    const appSettingsChain: Record<string, any> = {};
    const chainMethods = ['select', 'eq', 'neq', 'in', 'not', 'is', 'lte', 'gte', 'order', 'limit', 'update', 'insert'];
    for (const m of chainMethods) {
      appSettingsChain[m] = vi.fn().mockReturnValue(appSettingsChain);
    }
    appSettingsChain.single = vi.fn().mockImplementation(() => {
      appSettingsCallCount++;
      if (appSettingsCallCount === 1) {
        return Promise.resolve({ data: { value: baseSlackConfig }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    appSettingsChain.maybeSingle = vi.fn().mockImplementation(() => {
      appSettingsCallCount++;
      return Promise.resolve({ data: { value: { trigger: 'all_score_updates' } }, error: null });
    });
    appSettingsChain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: null, error: null }).then(resolve);

    mockRpcChain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });

    mockSupabaseServer.from.mockImplementation((table: string) => {
      if (table === 'app_settings') return appSettingsChain;
      if (table === 'seasons') return mockChain({ data: [{ id: 'season-1' }], error: null });
      if (table === 'events') return mockChain({ data: [{ id: 'event-1', is_major: false }], error: null });
      if (table === 'scores') return mockChain({ data: [], error: null });
      if (table === 'feature_flags') return mockChain({ data: { key: 'chirps-queue', enabled: true, target_user_ids: [], target_roles: [] }, error: null });
      return mockChain({ data: null, error: null });
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
        player_name: 'Matt Davis',
        course_name: 'Pine Valley',
        tee_name: 'White',
        par: 72,
        gross_score: 85,
        net_strokes_over_par: 5,
        holes_played: 18,
        max_holes: 18,
        is_complete: true,
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);

    const formatCall = mockFormatSlackMessage.mock.calls[0];
    const chirpOverrideArg = formatCall[3];
    expect(chirpOverrideArg).toBeUndefined();
  });
});

describe('Score Post Trigger in Slack Notify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
    global.fetch = mockFetch;
    mockIsFeatureEnabled.mockResolvedValue(false);
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it('skips entire Slack post when score_post_trigger is nine_holes_complete and holes < 9', async () => {
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    const slackConfigWith9h = {
      ...baseSlackConfig,
      score_post_trigger: 'nine_holes_complete',
    };

    let appSettingsCallCount = 0;
    const appSettingsChain: Record<string, any> = {};
    const methods = ['select', 'eq', 'neq', 'in', 'not', 'is', 'lte', 'gte', 'order', 'limit', 'update', 'insert'];
    for (const m of methods) {
      appSettingsChain[m] = vi.fn().mockReturnValue(appSettingsChain);
    }
    appSettingsChain.single = vi.fn().mockImplementation(() => {
      appSettingsCallCount++;
      if (appSettingsCallCount === 1) {
        return Promise.resolve({ data: { value: slackConfigWith9h }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    appSettingsChain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    appSettingsChain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: null, error: null }).then(resolve);

    mockSupabaseServer.from.mockImplementation((table: string) => {
      if (table === 'app_settings') return appSettingsChain;
      return mockChain({ data: null, error: null });
    });

    const { POST } = await import('@/app/api/slack/notify/route');
    const req = new Request('http://localhost/api/slack/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'score_in_progress',
        player_name: 'John Smith',
        course_name: 'Pine Valley',
        tee_name: 'White',
        par: 72,
        gross_score: 20,
        net_strokes_over_par: -1,
        holes_played: 4,
        max_holes: 18,
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(false);
    expect(data.reason).toBe('score_post_trigger_skip');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('allows Slack post when score_post_trigger is nine_holes_complete and holes >= 9', async () => {
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    const slackConfigWith9h = {
      ...baseSlackConfig,
      score_post_trigger: 'nine_holes_complete',
    };

    let appSettingsCallCount = 0;
    const appSettingsChain: Record<string, any> = {};
    const methods = ['select', 'eq', 'neq', 'in', 'not', 'is', 'lte', 'gte', 'order', 'limit', 'update', 'insert'];
    for (const m of methods) {
      appSettingsChain[m] = vi.fn().mockReturnValue(appSettingsChain);
    }
    appSettingsChain.single = vi.fn().mockImplementation(() => {
      appSettingsCallCount++;
      if (appSettingsCallCount === 1) {
        return Promise.resolve({ data: { value: slackConfigWith9h }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    appSettingsChain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    appSettingsChain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: null, error: null }).then(resolve);

    mockSupabaseServer.from.mockImplementation((table: string) => {
      if (table === 'app_settings') return appSettingsChain;
      if (table === 'seasons') return mockChain({ data: [{ id: 'season-1' }], error: null });
      if (table === 'events') return mockChain({ data: [{ id: 'event-1', is_major: false }], error: null });
      if (table === 'scores') return mockChain({ data: [], error: null });
      return mockChain({ data: null, error: null });
    });

    mockFetch.mockResolvedValueOnce({
      json: () => Promise.resolve({ ok: true }),
    });

    const { POST } = await import('@/app/api/slack/notify/route');
    const req = new Request('http://localhost/api/slack/notify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'score_in_progress',
        player_name: 'John Smith',
        course_name: 'Pine Valley',
        tee_name: 'White',
        par: 72,
        gross_score: 40,
        net_strokes_over_par: -2,
        holes_played: 9,
        max_holes: 18,
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('always allows round_complete through regardless of score_post_trigger', async () => {
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    const slackConfigRoundOnly = {
      ...baseSlackConfig,
      score_post_trigger: 'round_complete',
    };

    let appSettingsCallCount = 0;
    const appSettingsChain: Record<string, any> = {};
    const methods = ['select', 'eq', 'neq', 'in', 'not', 'is', 'lte', 'gte', 'order', 'limit', 'update', 'insert'];
    for (const m of methods) {
      appSettingsChain[m] = vi.fn().mockReturnValue(appSettingsChain);
    }
    appSettingsChain.single = vi.fn().mockImplementation(() => {
      appSettingsCallCount++;
      if (appSettingsCallCount === 1) {
        return Promise.resolve({ data: { value: slackConfigRoundOnly }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    appSettingsChain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    appSettingsChain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: null, error: null }).then(resolve);

    mockSupabaseServer.from.mockImplementation((table: string) => {
      if (table === 'app_settings') return appSettingsChain;
      if (table === 'seasons') return mockChain({ data: [{ id: 'season-1' }], error: null });
      if (table === 'events') return mockChain({ data: [{ id: 'event-1', is_major: false }], error: null });
      if (table === 'scores') return mockChain({ data: [], error: null });
      return mockChain({ data: null, error: null });
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
        gross_score: 80,
        net_strokes_over_par: 0,
        holes_played: 18,
        max_holes: 18,
        is_complete: true,
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalled();
  });

  it('skips mid-round updates (holes 10-17) when score_post_trigger is nine_holes_complete', async () => {
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    const slackConfigWith9h = {
      ...baseSlackConfig,
      score_post_trigger: 'nine_holes_complete',
    };

    let appSettingsCallCount = 0;
    const appSettingsChain: Record<string, any> = {};
    const methods = ['select', 'eq', 'neq', 'in', 'not', 'is', 'lte', 'gte', 'order', 'limit', 'update', 'insert'];
    for (const m of methods) {
      appSettingsChain[m] = vi.fn().mockReturnValue(appSettingsChain);
    }
    appSettingsChain.single = vi.fn().mockImplementation(() => {
      appSettingsCallCount++;
      if (appSettingsCallCount === 1) {
        return Promise.resolve({ data: { value: slackConfigWith9h }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    appSettingsChain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    appSettingsChain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: null, error: null }).then(resolve);

    mockSupabaseServer.from.mockImplementation((table: string) => {
      if (table === 'app_settings') return appSettingsChain;
      return mockChain({ data: null, error: null });
    });

    const { POST } = await import('@/app/api/slack/notify/route');

    // Test holes 10 through 17 — all should be skipped
    for (const holes of [10, 11, 12, 13, 14, 15, 16, 17]) {
      vi.clearAllMocks();
      mockSupabaseServer.auth.getUser.mockResolvedValue({
        data: { user: { id: 'user-1' } },
        error: null,
      });
      appSettingsCallCount = 0;
      mockSupabaseServer.from.mockImplementation((table: string) => {
        if (table === 'app_settings') return appSettingsChain;
        return mockChain({ data: null, error: null });
      });

      const req = new Request('http://localhost/api/slack/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_type: 'score_in_progress',
          player_name: 'Grady Bunn',
          course_name: 'Sweetens Cove GC',
          tee_name: 'White',
          par: 72,
          gross_score: 40 + (holes - 9) * 5,
          net_strokes_over_par: 2,
          holes_played: holes,
          max_holes: 18,
        }),
      });

      const res = await POST(req as any);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(false);
      expect(data.reason).toBe('score_post_trigger_skip');
      expect(mockFetch).not.toHaveBeenCalled();
    }
  });

  it('allows round_complete through when score_post_trigger is nine_holes_complete', async () => {
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });

    const slackConfigWith9h = {
      ...baseSlackConfig,
      score_post_trigger: 'nine_holes_complete',
    };

    let appSettingsCallCount = 0;
    const appSettingsChain: Record<string, any> = {};
    const methods = ['select', 'eq', 'neq', 'in', 'not', 'is', 'lte', 'gte', 'order', 'limit', 'update', 'insert'];
    for (const m of methods) {
      appSettingsChain[m] = vi.fn().mockReturnValue(appSettingsChain);
    }
    appSettingsChain.single = vi.fn().mockImplementation(() => {
      appSettingsCallCount++;
      if (appSettingsCallCount === 1) {
        return Promise.resolve({ data: { value: slackConfigWith9h }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    appSettingsChain.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    appSettingsChain.then = (resolve: (v: unknown) => void) =>
      Promise.resolve({ data: null, error: null }).then(resolve);

    mockSupabaseServer.from.mockImplementation((table: string) => {
      if (table === 'app_settings') return appSettingsChain;
      if (table === 'seasons') return mockChain({ data: [{ id: 'season-1' }], error: null });
      if (table === 'events') return mockChain({ data: [{ id: 'event-1', is_major: false }], error: null });
      if (table === 'scores') return mockChain({ data: [], error: null });
      return mockChain({ data: null, error: null });
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
        player_name: 'Grady Bunn',
        course_name: 'Sweetens Cove GC',
        tee_name: 'White',
        par: 72,
        gross_score: 85,
        net_strokes_over_par: 3,
        holes_played: 18,
        max_holes: 18,
        is_complete: true,
      }),
    });

    const res = await POST(req as any);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalled();
  });
});
