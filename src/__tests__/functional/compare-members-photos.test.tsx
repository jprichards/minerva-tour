import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/stats',
  useParams: () => ({}),
}));

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: { id: 'user-1', full_name: 'Jason Richards', email: 'jason@test.com', handicap_index: 15.0 },
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

const mockMembers = [
  { id: 'user-1', full_name: 'Jason Richards', email: 'jason@test.com', role: 'member', profile_picture_url: null },
  { id: 'user-2', full_name: 'Tiger Woods', email: 'tiger@test.com', role: 'member', profile_picture_url: 'https://example.com/tiger.jpg' },
  { id: 'user-3', full_name: 'Rory McIlroy', email: 'rory@test.com', role: 'member', profile_picture_url: null },
];

const mockScores = [
  {
    id: 's1', user_id: 'user-1', gross_score: 85, net_score: 72, net_strokes_over_par: 0,
    holes_played: 18, is_complete: true, tee_time: '2025-05-10T14:00:00Z', created_at: '2025-05-10T00:00:00Z',
    event_id: 'evt-1',
  },
];

vi.mock('swr', () => ({
  default: () => ({
    data: { myScores: mockScores, allMembers: mockMembers },
    isLoading: false,
    error: null,
    mutate: vi.fn(),
  }),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

import StatsPage from '@/app/(protected)/stats/page';

describe('Stats Page - Compare Members Profile Photos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Compare with Members section', () => {
    render(<StatsPage />);
    expect(screen.getByText('Compare with Members')).toBeInTheDocument();
  });

  it('shows profile picture for members who have one', () => {
    render(<StatsPage />);
    // Tiger Woods has a profile_picture_url
    const tigerImg = screen.getByAltText('Tiger Woods');
    expect(tigerImg).toBeInTheDocument();
    expect(tigerImg).toHaveAttribute('src', 'https://example.com/tiger.jpg');
  });

  it('shows letter initial for members without a profile picture', () => {
    render(<StatsPage />);
    // Rory McIlroy has no profile picture — should show "R" initial
    expect(screen.getByText('R')).toBeInTheDocument();
  });

  it('does not show current user in the Compare list', () => {
    render(<StatsPage />);
    // Jason Richards (current user) should not appear in the list
    const links = screen.getAllByRole('link');
    const compareLinks = links.filter(l => l.getAttribute('href')?.startsWith('/stats/'));
    const hrefs = compareLinks.map(l => l.getAttribute('href'));
    expect(hrefs).not.toContain('/stats/user-1');
    expect(hrefs).toContain('/stats/user-2');
    expect(hrefs).toContain('/stats/user-3');
  });
});
