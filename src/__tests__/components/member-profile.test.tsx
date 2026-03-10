import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useParams: () => ({ id: 'member-1' }),
}));

const mockMember = {
  id: 'member-1',
  full_name: 'Jane Golfer',
  email: 'jane@example.com',
  handicap_index: 8.5,
  ghin_number: '9876543',
  role: 'member',
  is_commissioner: false,
  profile_picture_url: null,
};

const mockScores = [
  { id: 's-1', net_strokes_over_par: -3, gross_score: 69, tee_time: '2025-05-01T10:00:00Z', created_at: '2025-05-01T10:00:00Z', course_id: 'c-1', course: { course_name: 'Augusta National', tee_name: 'Gold', par: 72 }, event: null, holes_played: 18 },
  { id: 's-2', net_strokes_over_par: 4, gross_score: 82, tee_time: '2025-06-01T10:00:00Z', created_at: '2025-06-01T10:00:00Z', course_id: 'c-2', course: { course_name: 'Pebble Beach', tee_name: 'Blue', par: 72 }, event: null, holes_played: 18 },
  { id: 's-3', net_strokes_over_par: 1, gross_score: 74, tee_time: '2025-07-01T10:00:00Z', created_at: '2025-07-01T10:00:00Z', course_id: 'c-1', course: { course_name: 'Augusta National', tee_name: 'Gold', par: 72 }, event: null, holes_played: 18 },
  { id: 's-4', net_strokes_over_par: 2, gross_score: 76, tee_time: '2025-08-01T10:00:00Z', created_at: '2025-08-01T10:00:00Z', course_id: 'c-1', course: { course_name: 'Augusta National', tee_name: 'Gold', par: 72 }, event: null, holes_played: 18 },
];

function createChain(data: unknown) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ['select', 'eq', 'not', 'order', 'limit', 'in'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  chain.single = vi.fn().mockImplementation(() => {
    return Promise.resolve({ data, error: null });
  });
  chain.then = vi.fn().mockImplementation((resolve) => {
    const result = Array.isArray(data) ? { data, error: null } : { data, error: null };
    resolve(result);
    return Promise.resolve(result);
  });
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'users') return createChain(mockMember);
      if (table === 'scores') return createChain(mockScores);
      return createChain([]);
    }),
    auth: { signOut: vi.fn() },
  }),
}));

vi.mock('@/components/TrophyCase', () => ({
  default: () => <div data-testid="trophy-case" />,
}));

import MemberProfilePage from '@/app/(protected)/members/[id]/page';

describe('Member Profile - Notable Rounds & Courses', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders Notable Rounds with best and worst round links', async () => {
    render(<MemberProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Notable Rounds')).toBeInTheDocument();
    });

    expect(screen.getByText('Best Net Round')).toBeInTheDocument();
    expect(screen.getByText('Worst Net Round')).toBeInTheDocument();

    const bestLink = screen.getByText('Best Net Round').closest('a');
    expect(bestLink).toHaveAttribute('href', '/scores/s-1');

    const worstLink = screen.getByText('Worst Net Round').closest('a');
    expect(worstLink).toHaveAttribute('href', '/scores/s-2');
  });

  it('shows course names and net scores on notable round cards', async () => {
    render(<MemberProfilePage />);

    await waitFor(() => {
      expect(screen.getByText('Notable Rounds')).toBeInTheDocument();
    });

    const bestSection = screen.getByText('Best Net Round').closest('a')!;
    expect(bestSection).toHaveTextContent('Augusta National');
    expect(bestSection).toHaveTextContent('Gross: 69');

    const worstSection = screen.getByText('Worst Net Round').closest('a')!;
    expect(worstSection).toHaveTextContent('Pebble Beach');
    expect(worstSection).toHaveTextContent('Gross: 82');
  });

  it('renders Courses Played Most with counts', async () => {
    render(<MemberProfilePage />);

    await waitFor(() => {
      expect(screen.getByText(/Courses Played Most/)).toBeInTheDocument();
    });

    const heading = screen.getByText(/Courses Played Most/);
    const section = heading.parentElement!;
    expect(section).toHaveTextContent('Augusta National');
    expect(section).toHaveTextContent('3 rounds');
    expect(section).toHaveTextContent('Pebble Beach');
    expect(section).toHaveTextContent('1 round');
  });

  it('shows total unique courses count in section heading', async () => {
    render(<MemberProfilePage />);

    await waitFor(() => {
      expect(screen.getByText(/Courses Played Most/)).toBeInTheDocument();
    });

    expect(screen.getByText(/2 total/)).toBeInTheDocument();
  });
});
