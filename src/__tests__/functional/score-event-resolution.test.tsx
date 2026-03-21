import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockRouter = { push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/scores/add',
  useParams: () => ({}),
}));

const mockProfile = {
  id: 'user-1',
  full_name: 'Test User',
  email: 'test@example.com',
  role: 'admin',
  handicap_index: 12.5,
};

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: mockProfile,
    authUser: { id: 'user-1' },
    loading: false,
    isAdmin: true,
    isMember: true,
    isPlayingGuest: false,
    isAuthenticated: true,
  }),
}));

const _today = new Date();
const _start = new Date(_today);
_start.setDate(_start.getDate() - 14);
const _end = new Date(_today);
_end.setDate(_end.getDate() + 14);
const _startStr = _start.toISOString().split('T')[0];
const _endStr = _end.toISOString().split('T')[0];

vi.mock('@/lib/hooks/useSeason', () => ({
  useSeason: () => ({
    season: { id: 's-1', mode: 'regular_season', handicap_allowance: 95 },
    currentEvent: { id: 'evt-current', name: 'Event 3', event_number: 3, holes: 18, start_date: _startStr, end_date: _endStr, is_major: false, is_playoff: false },
    loading: false,
    isOffSeason: false,
    isRegularSeason: true,
    isPlayoffs: false,
    isTournament: false,
    canSubmitScores: true,
  }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

vi.mock('@/lib/slack-notify', () => ({
  notifySlack: vi.fn(),
}));

function createChainProxy(resolvedValue: unknown) {
  const handler: ProxyHandler<object> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve({ data: resolvedValue, error: null });
      }
      if (prop === 'single') {
        return () => Promise.resolve({ data: resolvedValue, error: null });
      }
      return new Proxy({}, handler);
    },
  };
  return new Proxy({}, handler);
}

let insertedScoreData: Record<string, unknown> | null = null;
let eventQueryCalls: { table: string; filters: Record<string, unknown> }[] = [];

const mockCourse = {
  id: 'course-1',
  course_name: 'Test Course',
  tee_name: 'Blue',
  par: 72,
  slope: 125,
  rating: 71.5,
  type: '18_holes',
};

const mockMembers = [
  { ...mockProfile },
  { id: 'user-2', full_name: 'Other Player', email: 'other@test.com', role: 'member', handicap_index: 15.0 },
];

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    let currentTable = '';
    let didInsert = false;
    const filters: Record<string, unknown> = {};
    const chain: Record<string, unknown> = {
      select: () => chain,
      eq: (col: string, val: unknown) => {
        filters[col] = val;
        return chain;
      },
      lte: (col: string, val: unknown) => {
        filters[`${col}_lte`] = val;
        return chain;
      },
      gte: (col: string, val: unknown) => {
        filters[`${col}_gte`] = val;
        return chain;
      },
      in: () => chain,
      order: () => chain,
      limit: () => chain,
      single: () => {
        if (currentTable === 'scores' && didInsert) {
          return Promise.resolve({ data: { id: 'new-score-1', ...insertedScoreData }, error: null });
        }
        return Promise.resolve({ data: null, error: null });
      },
      insert: (data: Record<string, unknown> | Record<string, unknown>[]) => {
        insertedScoreData = Array.isArray(data) ? data[0] : data;
        didInsert = true;
        return chain;
      },
      then: (resolve: (v: unknown) => void) => {
        if (currentTable === 'events') {
          eventQueryCalls.push({ table: currentTable, filters: { ...filters } });
          const startLte = filters['start_date_lte'] as string | undefined;
          if (startLte && startLte >= _startStr && startLte <= _endStr) {
            resolve({ data: [{ id: 'evt-resolved' }], error: null });
          } else {
            resolve({ data: [], error: null });
          }
        } else if (currentTable === 'courses') {
          resolve({ data: [mockCourse], error: null });
        } else if (currentTable === 'users') {
          resolve({ data: mockMembers, error: null });
        } else if (currentTable === 'scores') {
          // Post-submit query for existing scores returns an array
          resolve({ data: [], error: null });
        } else {
          resolve({ data: [], error: null });
        }
      },
    };
    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
      },
      from: (table: string) => {
        currentTable = table;
        didInsert = false;
        Object.keys(filters).forEach(k => delete filters[k]);
        return chain;
      },
    };
  },
}));

vi.mock('@/lib/courses', () => ({
  fetchAllCourses: () => Promise.resolve([{
    id: 'course-1',
    course_name: 'Test Course',
    tee_name: 'Blue',
    par: 72,
    slope: 125,
    rating: 71.5,
    type: '18_holes',
  }]),
  formatCourseType: (t: string) => t,
}));

import AddScorePage from '@/app/(protected)/scores/add/page';

describe('Score Event Resolution - round date determines event_id', () => {
  beforeEach(() => {
    insertedScoreData = null;
    eventQueryCalls = [];
    vi.clearAllMocks();
  });

  it('queries events table with the round date to resolve event_id', async () => {
    render(<AddScorePage />);

    // Step 1: Select course
    await waitFor(() => {
      expect(screen.getByText('Test Course')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Test Course'));

    // Step 2: Select player (self)
    await waitFor(() => {
      expect(screen.getByText('Me')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Me'));

    // Step 3: Submit (date defaults to today which is within the event window)
    await waitFor(() => {
      expect(screen.getByText('Save Tee Time')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save Tee Time'));

    await waitFor(() => {
      // The event query should have been called with season_id and date filters
      expect(eventQueryCalls.length).toBeGreaterThan(0);
      const eventCall = eventQueryCalls.find(c => c.table === 'events');
      expect(eventCall).toBeDefined();
      expect(eventCall!.filters['season_id']).toBe('s-1');
    });
  });

  it('assigns resolved event_id to the score (not currentEvent.id)', async () => {
    render(<AddScorePage />);

    // Step 1: Select course
    await waitFor(() => {
      expect(screen.getByText('Test Course')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Test Course'));

    // Step 2: Select player (self)
    await waitFor(() => {
      expect(screen.getByText('Me')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Me'));

    // Step 3: Submit
    await waitFor(() => {
      expect(screen.getByText('Save Tee Time')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText('Save Tee Time'));

    await waitFor(() => {
      expect(insertedScoreData).not.toBeNull();
    });

    // The event_id should come from the date-based lookup, not from currentEvent
    // (currentEvent.id is 'evt-current', resolved is 'evt-resolved')
    expect(insertedScoreData!.event_id).toBe('evt-resolved');
  });
});
