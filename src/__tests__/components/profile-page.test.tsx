import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: {
      id: 'user-1',
      full_name: 'Test User',
      email: 'test@example.com',
      handicap_index: 10.2,
      ghin_number: '1234567',
      role: 'member',
      is_commissioner: false,
      profile_picture_url: null,
    },
    authUser: { id: 'user-1' },
    loading: false,
  }),
}));

vi.mock('@/components/ThemeProvider', () => ({
  useThemeContext: () => ({
    preference: 'system' as const,
    setTheme: vi.fn(),
  }),
}));

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }));

const mockScores = [
  { id: 'score-1', net_strokes_over_par: -2, gross_score: 70, tee_time: '2025-06-01T10:00:00Z', created_at: '2025-06-01T10:00:00Z', course: { course_name: 'Pine Valley', tee_name: 'Blue', par: 72, type: '18_holes' } },
  { id: 'score-2', net_strokes_over_par: 3, gross_score: 78, tee_time: '2025-06-15T10:00:00Z', created_at: '2025-06-15T10:00:00Z', course: { course_name: 'Oak Hills', tee_name: 'White', par: 72, type: '18_holes' } },
  { id: 'score-3', net_strokes_over_par: 0, gross_score: 72, tee_time: '2025-07-01T10:00:00Z', created_at: '2025-07-01T10:00:00Z', course: { course_name: 'Pine Valley', tee_name: 'Blue', par: 72, type: '18_holes' } },
  { id: 'score-4', net_strokes_over_par: 5, gross_score: 80, tee_time: '2025-07-15T10:00:00Z', created_at: '2025-07-15T10:00:00Z', course: { course_name: 'Oak Hills', tee_name: 'White', par: 72, type: '18_holes' } },
  { id: 'score-5', net_strokes_over_par: 1, gross_score: 74, tee_time: '2025-08-01T10:00:00Z', created_at: '2025-08-01T10:00:00Z', course: { course_name: 'Pine Valley', tee_name: 'Blue', par: 72, type: '18_holes' } },
];

function createChain(data: unknown[] = []) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ['select', 'eq', 'not', 'order', 'limit', 'single'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.then = vi.fn().mockImplementation((resolve) => {
    resolve({ data, error: null });
    return Promise.resolve({ data, error: null });
  });
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'scores') return createChain(mockScores);
      return createChain([]);
    }),
    auth: { signOut: vi.fn() },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ data: {}, error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: '' } }),
      }),
    },
  }),
}));

vi.mock('@/components/TrophyCase', () => ({
  default: () => <div data-testid="trophy-case" />,
}));

import ProfilePage from '@/app/(protected)/profile/page';

describe('Profile Page - Stat Tiles', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders all four stat tiles: Rounds, Avg Net, Best Net, Worst Net', async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Rounds')).toBeInTheDocument();
    });

    expect(screen.getByText('Avg Net')).toBeInTheDocument();
    expect(screen.getByText('Best Net')).toBeInTheDocument();
    expect(screen.getByText('Worst Net')).toBeInTheDocument();
  });

  it('uses a 2-column grid for stat tiles', async () => {
    const { container } = render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Rounds')).toBeInTheDocument();
    });

    const grid = screen.getByText('Rounds').closest('.grid');
    expect(grid).toHaveClass('grid-cols-2');
  });

  it('renders Notable Rounds section with best and worst round', async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Notable Rounds')).toBeInTheDocument();
    });

    expect(screen.getByText('Best Net Round')).toBeInTheDocument();
    expect(screen.getByText('Worst Net Round')).toBeInTheDocument();

    const bestLink = screen.getByText('Best Net Round').closest('a');
    expect(bestLink).toHaveAttribute('href', '/scores/score-1');

    const worstLink = screen.getByText('Worst Net Round').closest('a');
    expect(worstLink).toHaveAttribute('href', '/scores/score-4');
  });

  it('shows course names in Notable Rounds cards', async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Notable Rounds')).toBeInTheDocument();
    });

    const notableSection = screen.getByText('Notable Rounds').parentElement!;
    const courseNames = notableSection.querySelectorAll('.text-sm.font-medium');
    const names = Array.from(courseNames).map((el) => el.textContent);
    expect(names).toContain('Pine Valley');
    expect(names).toContain('Oak Hills');
  });

  it('renders Courses Played Most section with top courses', async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText(/Courses Played Most/)).toBeInTheDocument();
    });

    const heading = screen.getByText(/Courses Played Most/);
    const section = heading.parentElement!;
    expect(section).toHaveTextContent('Pine Valley');
    expect(section).toHaveTextContent('3 rounds');
    expect(section).toHaveTextContent('Oak Hills');
    expect(section).toHaveTextContent('2 rounds');
  });

  it('renders Recent Rounds section above Quick Stats', async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Recent Rounds')).toBeInTheDocument();
    });

    const recentHeading = screen.getByText('Recent Rounds');
    const roundsLabel = screen.getByText('Rounds');
    const container = recentHeading.closest('.space-y-5')!;
    const allElements = Array.from(container.children);
    const recentIdx = allElements.findIndex((el) => el.contains(recentHeading));
    const statsIdx = allElements.findIndex((el) => el.contains(roundsLabel));
    expect(recentIdx).toBeLessThan(statsIdx);
  });

  it('limits Recent Rounds to 5 entries', async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Recent Rounds')).toBeInTheDocument();
    });

    const recentSection = screen.getByText('Recent Rounds').parentElement!;
    const links = recentSection.querySelectorAll('a[href^="/scores/"]');
    expect(links.length).toBeLessThanOrEqual(5);
  });

  it('renders All Time Stats header above the stats grid', async () => {
    render(<ProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('All Time Stats')).toBeInTheDocument();
    });

    const header = screen.getByText('All Time Stats');
    const section = header.parentElement!;
    expect(section).toHaveTextContent('Rounds');
    expect(section).toHaveTextContent('Avg Net');
    expect(section).toHaveTextContent('Best Net');
    expect(section).toHaveTextContent('Worst Net');
  });
});
