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
    profile: { id: 'user-1', full_name: 'Jason Richards', email: 'jason@test.com', handicap_index: 15.0 },
    authUser: { id: 'user-1' },
    loading: false,
    isAdmin: true,
    isMember: true,
    isPlayingGuest: false,
    isAuthenticated: true,
  }),
}));

vi.mock('@/lib/hooks/useSeason', () => ({
  useSeason: () => ({
    currentEvent: { id: 'evt-1', holes: 18, is_major: false, is_playoff: false },
    canSubmitScores: true,
    isOffSeason: false,
    isRegularSeason: true,
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
  { id: 'c-1', course_name: 'Pine Valley', tee_name: 'Blue', type: '18_holes', par: 72, rating: 72.5, slope: 130, added_by: 'user-1', last_edited_by: null, created_at: '', updated_at: '' },
  { id: 'c-2', course_name: 'Bobby Jones - Magnolia', tee_name: 'White', type: '18_holes', par: 71, rating: 70.2, slope: 125, added_by: 'user-1', last_edited_by: null, created_at: '', updated_at: '' },
  { id: 'c-3', course_name: 'Bobby Jones - Azalea', tee_name: 'Blue', type: '18_holes', par: 72, rating: 71.8, slope: 128, added_by: 'user-1', last_edited_by: null, created_at: '', updated_at: '' },
  { id: 'c-4', course_name: 'Executive Nine', tee_name: 'Red', type: '9_holes', par: 35, rating: 33.5, slope: 110, added_by: 'user-1', last_edited_by: null, created_at: '', updated_at: '' },
];

const baseTeeTime = {
  id: 'score-1',
  user_id: 'user-1',
  course_id: 'c-1',
  gross_score: null,
  net_score: null,
  net_strokes_over_par: null,
  holes_played: null,
  is_complete: false,
  course_handicap: null,
  points_awarded: null,
  tee_time: '2026-03-10T14:00:00Z',
  submitted_by: 'user-1',
  created_at: '2026-03-01T00:00:00Z',
  event_id: 'evt-1',
  course: mockCourses[0],
  user: { full_name: 'Jason Richards', email: 'jason@test.com', handicap_index: 15.0 },
  event: { id: 'evt-1', name: 'Event 1', start_date: '2026-03-01', end_date: '2026-03-14', event_number: 1, is_major: false, season_id: 's-1', holes: 18 },
};

let mockScoreData = { ...baseTeeTime };
let mockUpdatePayload: Record<string, unknown> | null = null;

function createChainProxy(resolveData: unknown = null): unknown {
  const handler: ProxyHandler<CallableFunction> = {
    get(_target, prop) {
      if (prop === 'then') {
        return (resolve: (v: unknown) => void) => resolve({ data: resolveData, error: null });
      }
      return (..._args: unknown[]) => new Proxy(() => {}, handler);
    },
    apply() {
      return new Proxy(() => {}, handler);
    },
  };
  return new Proxy(() => {}, handler);
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'scores') {
        return {
          select: () => ({
            eq: () => ({
              single: () => Promise.resolve({ data: mockScoreData, error: null }),
            }),
          }),
          update: (payload: Record<string, unknown>) => {
            mockUpdatePayload = payload;
            return createChainProxy(null);
          },
          delete: () => createChainProxy(null),
        };
      }
      if (table === 'seasons') {
        return createChainProxy([{ id: 's-1' }]);
      }
      if (table === 'events') {
        return createChainProxy([{ id: 'evt-1', name: 'Event 1', start_date: '2026-03-01', end_date: '2026-03-14', event_number: 1, is_major: false, season_id: 's-1', holes: 18 }]);
      }
      if (table === 'courses') {
        return {
          select: () => ({
            order: () => ({
              range: () => Promise.resolve({ data: mockCourses, error: null }),
            }),
          }),
        };
      }
      return createChainProxy(null);
    },
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }),
    },
  }),
}));

import ScoreDetailPage from '@/app/(protected)/scores/[id]/page';

function findEditButton(container: HTMLElement): HTMLElement | null {
  const svg = container.querySelector('svg.lucide-pencil, svg.lucide-square-pen');
  return svg?.closest('button') || null;
}

describe('Score Detail Page - Course/Tee Change', () => {
  beforeEach(() => {
    mockScoreData = { ...baseTeeTime };
    mockUpdatePayload = null;
    vi.clearAllMocks();
  });

  it('shows Change button when in edit mode', async () => {
    const { container } = render(<ScoreDetailPage />);

    await screen.findByText('Pine Valley');
    const editBtn = findEditButton(container);
    expect(editBtn).toBeTruthy();
    fireEvent.click(editBtn!);

    expect(await screen.findByText('Change')).toBeInTheDocument();
  });

  it('does not show Change button when not editing', async () => {
    render(<ScoreDetailPage />);

    await screen.findByText('Pine Valley');
    expect(screen.queryByText('Change')).not.toBeInTheDocument();
  });

  it('opens course picker when Change is clicked', async () => {
    const { container } = render(<ScoreDetailPage />);

    await screen.findByText('Pine Valley');
    fireEvent.click(findEditButton(container)!);

    const changeBtn = await screen.findByText('Change');
    fireEvent.click(changeBtn);

    expect(await screen.findByText('Select Course / Tee')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Search courses...')).toBeInTheDocument();
  });

  it('shows available courses in picker', async () => {
    const { container } = render(<ScoreDetailPage />);

    await screen.findByText('Pine Valley');
    fireEvent.click(findEditButton(container)!);
    fireEvent.click(await screen.findByText('Change'));

    expect(await screen.findByText('Bobby Jones - Magnolia')).toBeInTheDocument();
    expect(screen.getByText('Bobby Jones - Azalea')).toBeInTheDocument();
  });

  it('filters courses matching event holes (hides 9-hole courses for 18-hole event)', async () => {
    const { container } = render(<ScoreDetailPage />);

    await screen.findByText('Pine Valley');
    fireEvent.click(findEditButton(container)!);
    fireEvent.click(await screen.findByText('Change'));

    await screen.findByText('Bobby Jones - Magnolia');
    expect(screen.queryByText('Executive Nine')).not.toBeInTheDocument();
  });

  it('filters courses by search text', async () => {
    const { container } = render(<ScoreDetailPage />);

    await screen.findByText('Pine Valley');
    fireEvent.click(findEditButton(container)!);
    fireEvent.click(await screen.findByText('Change'));

    const searchInput = await screen.findByPlaceholderText('Search courses...');
    fireEvent.change(searchInput, { target: { value: 'Magnolia' } });

    expect(screen.getByText('Bobby Jones - Magnolia')).toBeInTheDocument();
    expect(screen.queryByText('Bobby Jones - Azalea')).not.toBeInTheDocument();
  });

  it('selects a new course and shows it on the score card', async () => {
    const { container } = render(<ScoreDetailPage />);

    await screen.findByText('Pine Valley');
    fireEvent.click(findEditButton(container)!);
    fireEvent.click(await screen.findByText('Change'));

    const magnoliaBtn = await screen.findByText('Bobby Jones - Magnolia');
    fireEvent.click(magnoliaBtn.closest('button')!);

    await waitFor(() => {
      expect(screen.queryByText('Select Course / Tee')).not.toBeInTheDocument();
      expect(screen.getByText('Bobby Jones - Magnolia')).toBeInTheDocument();
      expect(screen.getByText(/Changed from: Pine Valley/)).toBeInTheDocument();
    });
  });

  it('closes course picker via X button', async () => {
    const { container } = render(<ScoreDetailPage />);

    await screen.findByText('Pine Valley');
    fireEvent.click(findEditButton(container)!);
    fireEvent.click(await screen.findByText('Change'));

    await screen.findByText('Select Course / Tee');

    const closeButtons = screen.getAllByRole('button');
    const xButton = closeButtons.find(btn => btn.querySelector('.lucide-x'));
    fireEvent.click(xButton!);

    await waitFor(() => {
      expect(screen.queryByText('Select Course / Tee')).not.toBeInTheDocument();
    });
  });

  it('reverts course selection on Cancel', async () => {
    const { container } = render(<ScoreDetailPage />);

    await screen.findByText('Pine Valley');
    fireEvent.click(findEditButton(container)!);
    fireEvent.click(await screen.findByText('Change'));

    const magnoliaBtn = await screen.findByText('Bobby Jones - Magnolia');
    fireEvent.click(magnoliaBtn.closest('button')!);

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByText(/Changed from:/)).not.toBeInTheDocument();
    });
  });

  it('includes course_id in update payload when course is changed', async () => {
    const { container } = render(<ScoreDetailPage />);

    await screen.findByText('Pine Valley');
    fireEvent.click(findEditButton(container)!);
    fireEvent.click(await screen.findByText('Change'));

    const magnoliaBtn = await screen.findByText('Bobby Jones - Magnolia');
    fireEvent.click(magnoliaBtn.closest('button')!);

    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(mockUpdatePayload).toBeTruthy();
      expect(mockUpdatePayload?.course_id).toBe('c-2');
    });
  });

  it('keeps original course_id in update when course is not changed', async () => {
    const { container } = render(<ScoreDetailPage />);

    await screen.findByText('Pine Valley');
    fireEvent.click(findEditButton(container)!);

    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(mockUpdatePayload).toBeTruthy();
      expect(mockUpdatePayload?.course_id).toBe('c-1');
    });
  });
});
