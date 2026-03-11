import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/stats',
  useParams: () => ({}),
}));

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: { id: 'user-1', full_name: 'John Richards', email: 'john@test.com', handicap_index: 15.0 },
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
    currentEvent: null,
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

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }));

const mockScores = [
  {
    id: 's1', user_id: 'user-1', gross_score: 78, net_score: 70, net_strokes_over_par: -2,
    holes_played: 18, is_complete: true, tee_time: '2025-06-15T10:00:00Z',
    created_at: '2025-06-15T12:00:00Z', event_id: 'evt-1',
    course: { course_name: 'Erin Hills', tee_name: 'Blue', par: 72, type: '18_holes' },
  },
];

const mockMembers = [
  { id: 'user-1', full_name: 'John Richards', email: 'john@test.com', role: 'member', profile_picture_url: null },
  { id: 'user-2', full_name: 'Mike Smith', email: 'mike@test.com', role: 'member', profile_picture_url: null },
];

const mockFromChain = {
  select: vi.fn().mockReturnThis(),
  eq: vi.fn().mockReturnThis(),
  neq: vi.fn().mockReturnThis(),
  in: vi.fn().mockReturnThis(),
  not: vi.fn().mockReturnThis(),
  order: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
};

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: vi.fn((table: string) => {
      if (table === 'scores') {
        return {
          ...mockFromChain,
          select: vi.fn().mockReturnValue({
            ...mockFromChain,
            then: vi.fn((cb: (v: unknown) => unknown) => cb({ data: mockScores, error: null })),
          }),
        };
      }
      if (table === 'users') {
        return {
          ...mockFromChain,
          select: vi.fn().mockReturnValue({
            ...mockFromChain,
            then: vi.fn((cb: (v: unknown) => unknown) => cb({ data: mockMembers, error: null })),
          }),
        };
      }
      if (table === 'seasons') {
        return {
          ...mockFromChain,
          select: vi.fn().mockReturnValue({
            ...mockFromChain,
            then: vi.fn((cb: (v: unknown) => unknown) => cb({ data: [{ id: 's-1', year: 2025, mode: 'regular_season' }], error: null })),
          }),
        };
      }
      if (table === 'events') {
        return {
          ...mockFromChain,
          select: vi.fn().mockReturnValue({
            ...mockFromChain,
            then: vi.fn((cb: (v: unknown) => unknown) => cb({ data: [], error: null })),
          }),
        };
      }
      return mockFromChain;
    }),
  }),
}));

// Mock recharts ResponsiveContainer since jsdom has no layout
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactNode }) => (
      <div style={{ width: 375, height: 240 }}>{children}</div>
    ),
  };
});

import StatsPage from '@/app/(protected)/stats/page';

describe('Stats Page Tab Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with My Stats tab active by default', () => {
    render(<StatsPage />);

    expect(screen.getByRole('heading', { name: 'Tour Stats' })).toBeInTheDocument();
    const myStatsBtn = screen.getByRole('button', { name: 'My Stats' });
    const tourStatsBtn = screen.getByRole('button', { name: 'Tour Stats' });
    expect(myStatsBtn).toBeInTheDocument();
    expect(tourStatsBtn).toBeInTheDocument();
  });

  it('switches to Tour Stats tab when clicked', async () => {
    render(<StatsPage />);

    const tourStatsBtn = screen.getByRole('button', { name: 'Tour Stats' });
    fireEvent.click(tourStatsBtn);

    // Tour Stats tab should now show the season filter or loading state
    // The My Stats personal content should no longer be visible
    expect(screen.queryByText('Notable Rounds')).not.toBeInTheDocument();
  });

  it('switches back to My Stats tab', async () => {
    render(<StatsPage />);

    const tourStatsBtn = screen.getByRole('button', { name: 'Tour Stats' });
    fireEvent.click(tourStatsBtn);

    const myStatsBtn = screen.getByRole('button', { name: 'My Stats' });
    fireEvent.click(myStatsBtn);

    // Should no longer show tour-specific content
    expect(screen.queryByText('Points Race')).not.toBeInTheDocument();
  });
});
