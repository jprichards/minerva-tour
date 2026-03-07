import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const mockRouter = { push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/scores/score-1',
  useParams: () => ({ id: 'score-1' }),
}));

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: { id: 'user-1', full_name: 'Admin User', email: 'admin@test.com', role: 'admin' },
    authUser: { id: 'user-1' },
    loading: false,
    isAdmin: true,
    isMember: false,
    isPlayingGuest: false,
    isAuthenticated: true,
  }),
}));

vi.mock('@/lib/hooks/useSeason', () => ({
  useSeason: () => ({
    season: { id: 's-1', mode: 'regular_season' },
    currentEvent: { id: 'event-1', event_number: 1, holes: 18 },
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

const mockInsert = vi.fn();
const mockSelect = vi.fn();

const mockScore = {
  id: 'score-1',
  user_id: 'user-1',
  course_id: 'course-1',
  event_id: 'event-1',
  tee_time: '2026-03-07T10:00:00Z',
  gross_score: null,
  holes_played: null,
  is_complete: false,
  course_handicap: null,
  net_score: null,
  net_strokes_over_par: null,
  submitted_by: 'user-1',
  created_at: '2026-03-01T00:00:00Z',
  course: {
    id: 'course-1',
    course_name: 'Pine Valley',
    tee_name: 'Blue',
    type: '18_holes',
    rating: 72.5,
    slope: 130,
    par: 72,
  },
  user: {
    full_name: 'Admin User',
    email: 'admin@test.com',
    handicap_index: 10,
  },
  event: {
    id: 'event-1',
    event_number: 1,
    name: 'Event 1',
    is_major: false,
    start_date: '2026-03-01',
  },
};

const mockMembers = [
  { id: 'user-1', full_name: 'Admin User', email: 'admin@test.com', role: 'admin', handicap_index: 10 },
  { id: 'user-2', full_name: 'Bob Jones', email: 'bob@test.com', role: 'member', handicap_index: 15 },
  { id: 'user-3', full_name: 'Charlie Brown', email: 'charlie@test.com', role: 'member', handicap_index: 20 },
];

vi.mock('@/lib/supabase/client', () => {
  const createMockChain = (resolvedValue: unknown) => {
    const chain: Record<string, unknown> = {};
    const methods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'in', 'is', 'not', 'gte', 'lte', 'order', 'limit'];
    methods.forEach((m) => { chain[m] = vi.fn().mockReturnValue(chain); });
    chain.single = vi.fn().mockResolvedValue(resolvedValue);
    chain.then = vi.fn((resolve: (v: unknown) => void) => Promise.resolve(resolvedValue).then(resolve));
    return chain;
  };

  let callCount = 0;

  return {
    createClient: () => ({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
      from: vi.fn((table: string) => {
        if (table === 'scores') {
          callCount++;
          if (callCount === 1) {
            return createMockChain({ data: mockScore, error: null });
          }
          if (callCount === 2) {
            return createMockChain({ data: [{ user_id: 'user-1' }], error: null });
          }
          return {
            ...createMockChain({ data: [{ id: 'new-score-1', user_id: 'user-2' }], error: null }),
            insert: mockInsert.mockReturnValue({
              select: mockSelect.mockResolvedValue({
                data: [{ id: 'new-score-1', user_id: 'user-2' }],
                error: null,
              }),
            }),
          };
        }
        if (table === 'users') {
          return createMockChain({ data: mockMembers, error: null });
        }
        if (table === 'seasons') {
          return createMockChain({ data: [{ id: 's-1' }], error: null });
        }
        if (table === 'events') {
          return createMockChain({ data: [{ id: 'event-1' }], error: null });
        }
        if (table === 'audit_logs') {
          return createMockChain({ data: null, error: null });
        }
        return createMockChain({ data: null, error: null });
      }),
      channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
      removeChannel: vi.fn(),
    }),
  };
});

import ScoreDetailPage from '@/app/(protected)/scores/[id]/page';

describe('Score Detail - Copy to Members', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the Copy to Members button for authorized users', async () => {
    render(<ScoreDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Tee Time Detail')).toBeInTheDocument();
    });

    expect(screen.getByText('Copy to Members')).toBeInTheDocument();
  });

  it('opens the member picker when Copy to Members is clicked', async () => {
    render(<ScoreDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Copy to Members')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Copy to Members'));

    await waitFor(() => {
      expect(screen.getByText('Copy Tee Time to Members')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search members...')).toBeInTheDocument();
    });
  });
});
