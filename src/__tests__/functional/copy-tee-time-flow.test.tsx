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
  role: 'member',
  handicap_index: 12.5,
};

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: mockProfile,
    authUser: { id: 'user-1' },
    loading: false,
    isAdmin: false,
    isMember: true,
    isPlayingGuest: false,
    isAuthenticated: true,
  }),
}));

vi.mock('@/lib/hooks/useSeason', () => ({
  useSeason: () => ({
    season: { id: 's-1', mode: 'regular_season' },
    currentEvent: { id: 'event-1', event_number: 1, holes: 18, name: 'Event 1' },
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

const mockCourses = [
  { id: 'course-1', course_name: 'Pine Valley', tee_name: 'Blue', type: '18_holes', rating: 72.5, slope: 130, par: 72 },
];

const mockMembers = [
  { id: 'user-1', full_name: 'Test User', email: 'test@example.com', role: 'member', handicap_index: 12.5 },
  { id: 'user-2', full_name: 'Bob Jones', email: 'bob@test.com', role: 'member', handicap_index: 15 },
  { id: 'user-3', full_name: 'Charlie Brown', email: 'charlie@test.com', role: 'member', handicap_index: 20 },
];

let insertCallCount = 0;

vi.mock('@/lib/supabase/client', () => {
  const createChain = () => {
    const chain: Record<string, unknown> = {};
    ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'neq', 'in', 'is', 'not', 'gte', 'lte', 'order', 'limit'].forEach((m) => {
      chain[m] = vi.fn().mockReturnValue(chain);
    });
    chain.single = vi.fn().mockResolvedValue({ data: null, error: null });
    chain.then = vi.fn((resolve: (v: unknown) => void) => Promise.resolve({ data: null, error: null }).then(resolve));
    return chain;
  };

  return {
    createClient: () => ({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
        onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      },
      from: vi.fn((table: string) => {
        if (table === 'courses') {
          const chain = createChain();
          chain.then = vi.fn((resolve: (v: unknown) => void) => Promise.resolve({ data: mockCourses, error: null }).then(resolve));
          return chain;
        }
        if (table === 'users') {
          const chain = createChain();
          chain.then = vi.fn((resolve: (v: unknown) => void) => Promise.resolve({ data: mockMembers, error: null }).then(resolve));
          return chain;
        }
        if (table === 'scores') {
          const chain = createChain();
          chain.insert = vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockImplementation(() => {
                insertCallCount++;
                if (insertCallCount === 1) {
                  return Promise.resolve({
                    data: { id: 'score-new', user_id: 'user-1', course_id: 'course-1' },
                    error: null,
                  });
                }
                return Promise.resolve({
                  data: [
                    { id: 'score-copy-1', user_id: 'user-2' },
                    { id: 'score-copy-2', user_id: 'user-3' },
                  ],
                  error: null,
                });
              }),
              then: vi.fn((resolve: (v: unknown) => void) => {
                insertCallCount++;
                const result = insertCallCount === 1
                  ? { data: [{ id: 'score-copy-1', user_id: 'user-2' }], error: null }
                  : { data: [{ id: 'score-copy-2', user_id: 'user-3' }], error: null };
                return Promise.resolve(result).then(resolve);
              }),
            }),
          });
          chain.then = vi.fn((resolve: (v: unknown) => void) => Promise.resolve({ data: [], error: null }).then(resolve));
          return chain;
        }
        return createChain();
      }),
      channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() }),
      removeChannel: vi.fn(),
    }),
  };
});

import AddScorePage from '@/app/(protected)/scores/add/page';

describe('Copy Tee Time - Post-Submit Flow', () => {
  beforeEach(() => {
    insertCallCount = 0;
    vi.clearAllMocks();
  });

  it('shows course search on initial render', () => {
    render(<AddScorePage />);
    expect(screen.getByText('Submit Score')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search courses...')).toBeInTheDocument();
  });

  it('progresses through course and player steps', async () => {
    render(<AddScorePage />);

    await waitFor(() => {
      expect(screen.getByText('Pine Valley')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Pine Valley'));

    await waitFor(() => {
      expect(screen.getByText(/Select player/)).toBeInTheDocument();
    });

    expect(screen.getByText('Me')).toBeInTheDocument();
  });

  it('shows success step with copy option after submitting a tee time for self', async () => {
    render(<AddScorePage />);

    await waitFor(() => {
      expect(screen.getByText('Pine Valley')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Pine Valley'));

    await waitFor(() => {
      expect(screen.getByText('Me')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Me'));

    await waitFor(() => {
      expect(screen.getByText(/Enter details/)).toBeInTheDocument();
    });

    const submitButton = screen.getByText('Save Tee Time');
    fireEvent.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText('Tee Time Saved')).toBeInTheDocument();
    });

    expect(screen.getByText('Copy tee time to other members?')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search members...')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('navigates to /scores when Done is clicked on success step', async () => {
    render(<AddScorePage />);

    await waitFor(() => {
      expect(screen.getByText('Pine Valley')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Pine Valley'));
    await waitFor(() => { expect(screen.getByText('Me')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Me'));
    await waitFor(() => { expect(screen.getByText('Save Tee Time')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Save Tee Time'));
    await waitFor(() => { expect(screen.getByText('Done')).toBeInTheDocument(); });

    fireEvent.click(screen.getByText('Done'));
    expect(mockRouter.push).toHaveBeenCalledWith('/scores');
  });
});
