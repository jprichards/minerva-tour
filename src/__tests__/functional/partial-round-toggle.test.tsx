import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

// --- Add Score Page mocks ---

const mockRouter = { push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/scores/add',
  useParams: () => ({ id: 'score-1' }),
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
    isAdmin: true,
    isMember: true,
    isPlayingGuest: false,
    isAuthenticated: true,
  }),
}));

vi.mock('@/lib/hooks/useSeason', () => ({
  useSeason: () => ({
    season: { id: 's-1', mode: 'regular_season' },
    currentEvent: { id: 'evt-1', holes: 18, is_major: false, is_playoff: false, name: 'Event 1', event_number: 1, start_date: '2026-03-01', end_date: '2026-03-14' },
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
vi.mock('@/lib/slack-notify', () => ({ notifySlack: vi.fn() }));

const mockCourses = [
  { id: 'c-1', course_name: 'Pine Valley', tee_name: 'Blue', type: '18_holes', par: 72, rating: 72.5, slope: 130, added_by: 'user-1', last_edited_by: null, created_at: '', updated_at: '' },
  { id: 'c-9', course_name: 'Short Nine', tee_name: 'White', type: '9_holes', par: 36, rating: 34.0, slope: 115, added_by: 'user-1', last_edited_by: null, created_at: '', updated_at: '' },
];

const mockMembers = [
  { ...mockProfile },
  { id: 'user-2', full_name: 'Other Player', email: 'other@example.com', role: 'member', handicap_index: 18.0 },
];

const baseScore = {
  id: 'score-1',
  user_id: 'user-1',
  course_id: 'c-1',
  gross_score: 85,
  net_score: 71,
  net_strokes_over_par: -2,
  holes_played: 18,
  is_complete: true,
  course_handicap: 14,
  points_awarded: null,
  tee_time: '2026-03-10T14:00:00Z',
  submitted_by: 'user-1',
  created_at: '2026-03-01T00:00:00Z',
  event_id: 'evt-1',
  course: mockCourses[0],
  user: { full_name: 'Test User', email: 'test@example.com', handicap_index: 12.5 },
  event: { id: 'evt-1', name: 'Event 1', start_date: '2026-03-01', end_date: '2026-03-14', event_number: 1, is_major: false, season_id: 's-1', holes: 18 },
};

let mockScoreData = { ...baseScore };
let mockInsertPayload: Record<string, unknown> | null = null;

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
          insert: (payload: Record<string, unknown>) => {
            mockInsertPayload = payload;
            return {
              select: () => ({
                single: () => Promise.resolve({ data: { id: 'new-score', ...payload }, error: null }),
              }),
            };
          },
          update: () => createChainProxy(null),
          delete: () => createChainProxy(null),
        };
      }
      if (table === 'courses') {
        return {
          select: () => ({
            order: () => Promise.resolve({ data: mockCourses, error: null }),
          }),
        };
      }
      if (table === 'users') {
        return {
          select: () => ({
            in: () => ({
              order: () => Promise.resolve({ data: mockMembers, error: null }),
            }),
          }),
        };
      }
      if (table === 'seasons') {
        return createChainProxy([{ id: 's-1' }]);
      }
      if (table === 'events') {
        return createChainProxy([baseScore.event]);
      }
      return createChainProxy(null);
    },
    auth: {
      getUser: () => Promise.resolve({ data: { user: { id: 'user-1' } }, error: null }),
    },
  }),
}));

import AddScorePage from '@/app/(protected)/scores/add/page';
import ScoreDetailPage from '@/app/(protected)/scores/[id]/page';

function findEditButton(container: HTMLElement): HTMLElement | null {
  const svg = container.querySelector('svg.lucide-pencil, svg.lucide-square-pen');
  return svg?.closest('button') || null;
}

async function navigateToStep3Add() {
  render(<AddScorePage />);

  const courseBtn = await screen.findByText('Pine Valley');
  fireEvent.click(courseBtn.closest('button')!);

  const meBtn = await screen.findByText('Me');
  fireEvent.click(meBtn.closest('button')!);

  await screen.findByText(/Step 3 of 3/);
}

describe('Add Score Page - Partial Round Toggle', () => {
  beforeEach(() => {
    mockInsertPayload = null;
    vi.clearAllMocks();
  });

  it('shows "Partial round?" toggle on step 3', async () => {
    await navigateToStep3Add();
    expect(screen.getByText('Partial round?')).toBeInTheDocument();
  });

  it('toggle defaults to OFF (full round)', async () => {
    await navigateToStep3Add();
    const toggle = screen.getByRole('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('does not show holes played input when toggle is OFF', async () => {
    await navigateToStep3Add();
    expect(screen.queryByText('Holes Played')).not.toBeInTheDocument();
  });

  it('shows holes played input when toggle is turned ON', async () => {
    await navigateToStep3Add();
    const toggle = screen.getByRole('switch');
    fireEvent.click(toggle);

    expect(screen.getByText(/Holes Played/)).toBeInTheDocument();
  });

  it('hides holes played input when toggle is turned back OFF', async () => {
    await navigateToStep3Add();
    const toggle = screen.getByRole('switch');

    fireEvent.click(toggle);
    expect(screen.getByText(/Holes Played/)).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByText('Holes Played')).not.toBeInTheDocument();
  });

  it('clears holes played value when toggle is turned OFF', async () => {
    await navigateToStep3Add();
    const toggle = screen.getByRole('switch');

    fireEvent.click(toggle);
    const holesInput = screen.getByPlaceholderText('1-17');
    fireEvent.change(holesInput, { target: { value: '13' } });
    expect(holesInput).toHaveValue(13);

    fireEvent.click(toggle);
    fireEvent.click(toggle);

    const newHolesInput = screen.getByPlaceholderText('1-17');
    expect(newHolesInput).toHaveValue(null);
  });

  it('shows net score preview immediately when gross score is entered (full round)', async () => {
    await navigateToStep3Add();
    const grossInput = screen.getByPlaceholderText('e.g. 82');
    fireEvent.change(grossInput, { target: { value: '85' } });

    expect(screen.getByText('Net Score Preview')).toBeInTheDocument();
  });

  it('submit button is enabled with only gross score for full round', async () => {
    await navigateToStep3Add();
    const grossInput = screen.getByPlaceholderText('e.g. 82');
    fireEvent.change(grossInput, { target: { value: '85' } });

    const submitBtn = screen.getByRole('button', { name: 'Submit Score' });
    expect(submitBtn).not.toBeDisabled();
  });
});

describe('Score Detail Page - Partial Round Toggle', () => {
  beforeEach(() => {
    mockScoreData = { ...baseScore };
    vi.clearAllMocks();
  });

  it('shows partial round toggle in edit mode', async () => {
    const { container } = render(<ScoreDetailPage />);
    await screen.findByText('Pine Valley');

    fireEvent.click(findEditButton(container)!);
    expect(await screen.findByText('Partial round?')).toBeInTheDocument();
  });

  it('initializes toggle OFF for full round scores', async () => {
    mockScoreData = { ...baseScore, holes_played: 18 };
    const { container } = render(<ScoreDetailPage />);
    await screen.findByText('Pine Valley');

    fireEvent.click(findEditButton(container)!);
    const toggle = await screen.findByRole('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('false');
  });

  it('initializes toggle ON for partial round scores', async () => {
    mockScoreData = { ...baseScore, holes_played: 13 };
    const { container } = render(<ScoreDetailPage />);
    await screen.findByText('Pine Valley');

    fireEvent.click(findEditButton(container)!);
    const toggle = await screen.findByRole('switch');
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(screen.getByDisplayValue('13')).toBeInTheDocument();
  });

  it('does not show holes played input for full round edit', async () => {
    mockScoreData = { ...baseScore, holes_played: 18 };
    const { container } = render(<ScoreDetailPage />);
    await screen.findByText('Pine Valley');

    fireEvent.click(findEditButton(container)!);
    await screen.findByText('Partial round?');
    expect(screen.queryByLabelText(/Holes Played/)).not.toBeInTheDocument();
  });
});
