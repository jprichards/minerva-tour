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

const mockScores = [
  { net_strokes_over_par: -2, gross_score: 70 },
  { net_strokes_over_par: 3, gross_score: 78 },
  { net_strokes_over_par: 0, gross_score: 72 },
  { net_strokes_over_par: 5, gross_score: 80 },
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
});
