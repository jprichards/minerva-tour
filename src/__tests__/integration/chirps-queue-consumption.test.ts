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
