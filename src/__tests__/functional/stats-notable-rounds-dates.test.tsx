import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

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
];

// Scores with tee_time different from created_at to verify the correct date is shown
const mockScores = [
  {
    id: 's1', user_id: 'user-1', gross_score: 78, net_score: 68, net_strokes_over_par: -4,
    holes_played: 18, is_complete: true,
    tee_time: '2024-06-15T14:00:00Z',
    created_at: '2026-02-14T00:00:00Z',
    event_id: 'evt-1',
    course: { course_name: 'Torrey Pines', tee_name: 'Blue', par: 72, type: '18' },
  },
  {
    id: 's2', user_id: 'user-1', gross_score: 95, net_score: 85, net_strokes_over_par: 13,
    holes_played: 18, is_complete: true,
    tee_time: '2023-09-20T10:00:00Z',
    created_at: '2026-02-14T00:00:00Z',
    event_id: 'evt-2',
    course: { course_name: 'Augusta National', tee_name: 'Gold', par: 72, type: '18' },
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

describe('Stats Page - Notable Rounds Date Display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Notable Rounds section', () => {
    render(<StatsPage />);
    expect(screen.getByText('Notable Rounds')).toBeInTheDocument();
  });

  it('shows best round with tee_time date, not created_at', () => {
    render(<StatsPage />);
    // Best round is s1 with net_strokes_over_par -4, tee_time = June 15, 2024
    const bestLabel = screen.getByText('Best Round');
    const bestSection = bestLabel.closest('a')!;
    // Should contain the tee_time date (6/15/2024), not the created_at date (2/14/2026)
    expect(bestSection.textContent).toContain('2024');
    expect(bestSection.textContent).not.toContain('2026');
  });

  it('shows worst round with tee_time date, not created_at', () => {
    render(<StatsPage />);
    const worstLabel = screen.getByText('Worst Round');
    const worstSection = worstLabel.closest('a')!;
    // Should contain tee_time date (9/20/2023), not created_at (2/14/2026)
    expect(worstSection.textContent).toContain('2023');
    expect(worstSection.textContent).not.toContain('2026');
  });

  it('best round card has dark mode background and border classes', () => {
    render(<StatsPage />);
    const bestLabel = screen.getByText('Best Round');
    const bestCard = bestLabel.closest('a')!;
    expect(bestCard.className).toContain('dark:bg-green-900/30');
    expect(bestCard.className).toContain('dark:border-green-800');
  });

  it('worst round card has dark mode background and border classes', () => {
    render(<StatsPage />);
    const worstLabel = screen.getByText('Worst Round');
    const worstCard = worstLabel.closest('a')!;
    expect(worstCard.className).toContain('dark:bg-red-900/30');
    expect(worstCard.className).toContain('dark:border-red-800');
  });

  it('best round course name has dark-readable text classes', () => {
    render(<StatsPage />);
    const bestCard = screen.getByText('Best Round').closest('a')!;
    const courseName = bestCard.querySelector('p.dark\\:text-gray-100');
    expect(courseName).toBeInTheDocument();
    expect(courseName!.textContent).toBe('Torrey Pines');
  });

  it('worst round course name has dark-readable text classes', () => {
    render(<StatsPage />);
    const worstCard = screen.getByText('Worst Round').closest('a')!;
    const courseName = worstCard.querySelector('p.dark\\:text-gray-100');
    expect(courseName).toBeInTheDocument();
    expect(courseName!.textContent).toBe('Augusta National');
  });
});
