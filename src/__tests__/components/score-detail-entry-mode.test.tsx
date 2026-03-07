import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

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

const mockScoreData = {
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
  course: {
    id: 'course-1',
    course_name: 'Pine Valley',
    tee_name: 'Blue',
    type: '18_holes',
    par: 72,
    rating: 74.5,
    slope: 135,
  },
  user: { full_name: 'Test User', email: 'test@test.com', handicap_index: 15.0 },
  event: { id: 'event-1', name: 'Event 1', event_number: 1, start_date: '2026-03-01', end_date: '2026-03-31', is_major: false },
};

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

function clickEditButton() {
  const btn = document.querySelector('button svg.lucide-square-pen')?.closest('button');
  if (!btn) throw new Error('Edit button not found');
  fireEvent.click(btn);
}

describe('Score Detail - Entry Mode Toggle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSingle.mockResolvedValue({ data: { ...mockScoreData }, error: null });
  });

  it('shows the Gross Score / Gross to Par toggle when editing', async () => {
    render(<ScoreDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Tee Time Detail')).toBeInTheDocument();
    });

    clickEditButton();

    await waitFor(() => {
      expect(screen.getByText('Gross Score')).toBeInTheDocument();
      expect(screen.getByText('Gross to Par')).toBeInTheDocument();
    });
  });

  it('defaults to Gross Score mode with active styling', async () => {
    render(<ScoreDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Tee Time Detail')).toBeInTheDocument();
    });

    clickEditButton();

    await waitFor(() => {
      const grossBtn = screen.getByText('Gross Score');
      expect(grossBtn.className).toContain('bg-[var(--bg-card)]');
      const toParBtn = screen.getByText('Gross to Par');
      expect(toParBtn.className).not.toContain('bg-[var(--bg-card)]');
    });
  });

  it('switches to Gross to Par mode and shows conversion preview', async () => {
    render(<ScoreDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Tee Time Detail')).toBeInTheDocument();
    });

    clickEditButton();

    await waitFor(() => {
      expect(screen.getByText('Gross to Par')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Gross to Par'));

    const toParInput = screen.getByPlaceholderText('e.g. 5 for over, -2 for under');
    expect(toParInput).toBeInTheDocument();

    fireEvent.change(toParInput, { target: { value: '5' } });

    await waitFor(() => {
      expect(screen.getByText('= Gross 77')).toBeInTheDocument();
    });
  });

  it('converts values when switching between gross and toPar modes', async () => {
    render(<ScoreDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Tee Time Detail')).toBeInTheDocument();
    });

    clickEditButton();

    await waitFor(() => {
      expect(screen.getByText('Gross Score')).toBeInTheDocument();
    });

    // Enter gross 85 on a par-72 course → switching to toPar should show +13
    const grossInput = screen.getByPlaceholderText(/e\.g\. \d+/);
    fireEvent.change(grossInput, { target: { value: '85' } });
    expect(grossInput).toHaveValue(85);

    fireEvent.click(screen.getByText('Gross to Par'));
    const toParInput = screen.getByPlaceholderText('e.g. 5 for over, -2 for under');
    expect(toParInput).toHaveValue(13); // 85 - 72 = 13

    // Switch back to gross → should convert +13 back to 85
    fireEvent.click(screen.getByText('Gross Score'));
    const newGrossInput = screen.getByPlaceholderText(/e\.g\. \d+/);
    expect(newGrossInput).toHaveValue(85); // 72 + 13 = 85
  });

  it('shows negative over/under par correctly (under par)', async () => {
    render(<ScoreDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Tee Time Detail')).toBeInTheDocument();
    });

    clickEditButton();

    await waitFor(() => {
      expect(screen.getByText('Gross to Par')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Gross to Par'));

    const toParInput = screen.getByPlaceholderText('e.g. 5 for over, -2 for under');
    fireEvent.change(toParInput, { target: { value: '-2' } });

    await waitFor(() => {
      expect(screen.getByText('= Gross 70')).toBeInTheDocument();
    });
  });

  it('populates edit fields from current score state when entering edit mode', async () => {
    mockSingle.mockResolvedValue({
      data: {
        ...mockScoreData,
        gross_score: 82,
        holes_played: 14,
        is_complete: false,
      },
      error: null,
    });

    render(<ScoreDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Tee Time Detail')).toBeInTheDocument();
    });

    clickEditButton();

    await waitFor(() => {
      expect(screen.getByText('Gross Score')).toBeInTheDocument();
    });

    const grossInput = screen.getByPlaceholderText(/e\.g\. \d+/) as HTMLInputElement;
    expect(grossInput.value).toBe('82');

    const partialSwitch = screen.getByRole('switch');
    expect(partialSwitch.getAttribute('aria-checked')).toBe('true');

    const holesInput = screen.getByDisplayValue('14') as HTMLInputElement;
    expect(holesInput.value).toBe('14');
  });

  it('saves partial round with is_complete=false', async () => {
    const partialScore = {
      ...mockScoreData,
      gross_score: 42,
      holes_played: 9,
      is_complete: false,
    };
    mockSingle.mockResolvedValue({ data: { ...partialScore }, error: null });

    render(<ScoreDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Tee Time Detail')).toBeInTheDocument();
    });

    clickEditButton();

    await waitFor(() => {
      expect(screen.getByText('Gross Score')).toBeInTheDocument();
    });

    const grossInput = screen.getByPlaceholderText(/e\.g\. \d+/) as HTMLInputElement;
    expect(grossInput.value).toBe('42');

    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled();
    });

    const updatePayload = mockUpdate.mock.calls[0][0];
    expect(updatePayload.is_complete).toBe(false);
    expect(updatePayload.gross_score).toBe(42);
    expect(updatePayload.holes_played).toBe(9);
  });

  it('saves full round with is_complete=true', async () => {
    const fullScore = {
      ...mockScoreData,
      gross_score: 85,
      holes_played: 18,
      is_complete: true,
    };
    mockSingle.mockResolvedValue({ data: { ...fullScore }, error: null });

    render(<ScoreDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Round Detail')).toBeInTheDocument();
    });

    clickEditButton();

    await waitFor(() => {
      expect(screen.getByText('Gross Score')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Save Changes'));

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled();
    });

    const updatePayload = mockUpdate.mock.calls[0][0];
    expect(updatePayload.is_complete).toBe(true);
    expect(updatePayload.gross_score).toBe(85);
    expect(updatePayload.holes_played).toBe(18);
  });

  it('resets entry mode when canceling edit', async () => {
    render(<ScoreDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Tee Time Detail')).toBeInTheDocument();
    });

    clickEditButton();

    await waitFor(() => {
      expect(screen.getByText('Gross to Par')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Gross to Par'));
    expect(screen.getByPlaceholderText('e.g. 5 for over, -2 for under')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Cancel'));

    await waitFor(() => {
      expect(screen.queryByPlaceholderText('e.g. 5 for over, -2 for under')).not.toBeInTheDocument();
    });
  });
});
