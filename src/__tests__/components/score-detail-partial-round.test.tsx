import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mockPush = vi.fn();
const mockBack = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack, refresh: mockRefresh }),
  useParams: () => ({ id: 'score-1' }),
}));

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: { id: 'user-1', full_name: 'Test User', email: 'test@test.com', role: 'member' },
    isAdmin: false,
    loading: false,
  }),
}));

vi.mock('@/lib/hooks/useSeason', () => ({
  useSeason: () => ({ currentEvent: { id: 'event-1', holes: 18 } }),
}));

const mockShowToast = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/slack-notify', () => ({ notifySlack: vi.fn() }));
vi.mock('swr', () => ({ useSWRConfig: () => ({ mutate: vi.fn() }) }));

const baseCourse = {
  id: 'course-1',
  course_name: 'Pine Valley',
  tee_name: 'Blue',
  type: '18_holes',
  par: 72,
  rating: 71.6,
  slope: 127,
};

const baseEvent = {
  id: 'event-1',
  name: 'Event 1',
  event_number: 1,
  start_date: '2026-03-01',
  end_date: '2026-03-31',
  is_major: false,
};

function makeScore(overrides: Record<string, unknown>) {
  return {
    id: 'score-1',
    user_id: 'user-1',
    course_id: 'course-1',
    event_id: 'event-1',
    gross_score: null,
    holes_played: null,
    is_complete: false,
    tee_time: '2026-03-07T12:00:00Z',
    course_handicap: null,
    net_score: null,
    net_strokes_over_par: null,
    submitted_by: 'user-1',
    created_at: '2026-03-01T00:00:00Z',
    course: baseCourse,
    user: { full_name: 'Test User', email: 'test@test.com', handicap_index: 11.2 },
    event: baseEvent,
    ...overrides,
  };
}

const mockSingle = vi.fn();
const mockEq = vi.fn().mockReturnValue({ single: mockSingle });
const mockSelect = vi.fn().mockReturnValue({ eq: mockEq });
const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'scores') {
        return { select: mockSelect, update: mockUpdate };
      }
      if (table === 'seasons') {
        return {
          select: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [{ id: 'season-1' }] }),
            }),
          }),
        };
      }
      if (table === 'events') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              lte: vi.fn().mockReturnValue({
                gte: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({ data: [{ id: 'event-1' }] }),
                }),
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [] }),
        }),
      };
    },
  }),
}));

import ScoreDetailPage from '@/app/(protected)/scores/[id]/page';

describe('Score Detail - Partial Round Display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows correct gross to-par for in-progress round (5 of 18 holes)', async () => {
    // 5 holes of 18, gross 20, par 72 → partialPar = round(72*5/18) = 20 → even par
    mockSingle.mockResolvedValue({
      data: makeScore({
        gross_score: 20,
        holes_played: 5,
        is_complete: false,
        net_score: 17,
        net_strokes_over_par: -3,
        course_handicap: 12,
      }),
      error: null,
    });

    render(<ScoreDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('20 (E)')).toBeInTheDocument();
    });
  });

  it('shows correct gross to-par for in-progress round over partial par', async () => {
    // 9 holes of 18, gross 40, par 72 → partialPar = 36 → +4
    mockSingle.mockResolvedValue({
      data: makeScore({
        gross_score: 40,
        holes_played: 9,
        is_complete: false,
        net_score: 34,
        net_strokes_over_par: -2,
        course_handicap: 6,
      }),
      error: null,
    });

    render(<ScoreDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('40 (+4)')).toBeInTheDocument();
    });
  });

  it('shows correct gross to-par for completed round (uses full par)', async () => {
    // Completed 18-hole round, gross 80, par 72 → +8
    mockSingle.mockResolvedValue({
      data: makeScore({
        gross_score: 80,
        holes_played: 18,
        is_complete: true,
        net_score: 68,
        net_strokes_over_par: -4,
        course_handicap: 12,
      }),
      error: null,
    });

    render(<ScoreDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('80 (+8)')).toBeInTheDocument();
    });
  });

  it('hides scoring differential for in-progress rounds', async () => {
    mockSingle.mockResolvedValue({
      data: makeScore({
        gross_score: 20,
        holes_played: 5,
        is_complete: false,
        net_score: 17,
        net_strokes_over_par: -3,
        course_handicap: 12,
      }),
      error: null,
    });

    render(<ScoreDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('20 (E)')).toBeInTheDocument();
    });

    expect(screen.queryByText('Scoring Differential')).not.toBeInTheDocument();
  });

  it('shows scoring differential for completed rounds', async () => {
    mockSingle.mockResolvedValue({
      data: makeScore({
        gross_score: 80,
        holes_played: 18,
        is_complete: true,
        net_score: 68,
        net_strokes_over_par: -4,
        course_handicap: 12,
      }),
      error: null,
    });

    render(<ScoreDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Scoring Differential')).toBeInTheDocument();
    });

    // (113 / 127) * (80 - 71.6) = 0.8898 * 8.4 = 7.474...
    expect(screen.getByText('7.5')).toBeInTheDocument();
  });
});
