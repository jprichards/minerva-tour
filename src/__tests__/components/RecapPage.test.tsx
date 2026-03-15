import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import RecapPage from '@/app/(protected)/admin/recaps/[eventId]/page';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
  useParams: () => ({ eventId: 'test-event-id' }),
  usePathname: () => '/admin/recaps/test-event-id',
}));

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: { id: 'admin-user', role: 'admin' },
    isAdmin: true,
    loading: false,
  }),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({
    showToast: vi.fn(),
  }),
}));

const mockEventData = {
  id: 'test-event-id',
  season_id: 'season-1',
  event_number: 5,
  name: 'Event 5',
  start_date: '2025-06-01',
  end_date: '2025-06-14',
  holes: 18,
  is_major: false,
  is_playoff: false,
  created_at: '2025-01-01',
  updated_at: '2025-01-01',
  season: {
    id: 'season-1',
    year: 2025,
    mode: 'regular_season',
    current_event_id: null,
    handicap_allowance: 95,
    created_at: '2025-01-01',
    updated_at: '2025-01-01',
  },
};

const mockScores = [
  {
    id: 's1',
    user_id: 'u1',
    event_id: 'test-event-id',
    course_id: 'c1',
    tee_time: null,
    gross_score: 75,
    holes_played: 18,
    is_complete: true,
    course_handicap: 8,
    net_score: 67,
    net_strokes_over_par: -5,
    scratch_strokes_over_rating: 3,
    scratch_points_awarded: null,
    points_awarded: null,
    handicap_index_used: 8,
    combined_with_score_id: null,
    is_retroactive: false,
    submitted_by: null,
    created_at: '2025-06-05',
    updated_at: '2025-06-05',
    user: { id: 'u1', full_name: 'Matt Davis', email: 'matt@test.com', profile_picture_url: null, handicap_index: 8 },
    course: { id: 'c1', course_name: 'Augusta', tee_name: 'Gold', type: '18_holes', rating: 72, slope: 130, par: 72, created_by: null, created_at: '', updated_at: '', updated_by: null },
    event: mockEventData,
  },
];

let supabaseMocks: Record<string, unknown>;

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => {
    const chain = (tableName?: string) => {
      const obj: Record<string, unknown> = {};
      obj.select = vi.fn().mockReturnValue(obj);
      obj.eq = vi.fn().mockImplementation((col: string, val: string) => {
        if (col === 'id' && val === 'test-event-id') {
          obj.single = vi.fn().mockResolvedValue({ data: mockEventData, error: null });
        }
        if (col === 'id' && val === 'season-1') {
          obj.single = vi.fn().mockResolvedValue({ data: mockEventData.season, error: null });
        }
        if (col === 'event_id' && val === 'test-event-id') {
          obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        }
        if (col === 'key') {
          obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
          obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
        }
        if (col === 'season_id') {
          obj.order = vi.fn().mockResolvedValue({
            data: [mockEventData],
            error: null,
          });
        }
        return obj;
      });
      obj.in = vi.fn().mockResolvedValue({ data: mockScores, error: null });
      obj.order = vi.fn().mockReturnValue(obj);
      obj.single = vi.fn().mockResolvedValue({ data: null, error: null });
      obj.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
      return obj;
    };

    return {
      from: vi.fn().mockImplementation((table: string) => chain(table)),
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-user' } }, error: null }) },
    };
  },
}));

describe('RecapPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('renders the page header with event name', async () => {
    render(<RecapPage />);

    await waitFor(() => {
      expect(screen.getByText(/Event 5 Recap/)).toBeInTheDocument();
    });
  });

  it('shows the Generate Recap button', async () => {
    render(<RecapPage />);

    await waitFor(() => {
      expect(screen.getByText('Generate Recap')).toBeInTheDocument();
    });
  });

  it('shows commissioner notes textarea', async () => {
    render(<RecapPage />);

    await waitFor(() => {
      expect(screen.getByText('Commissioner Notes (optional)')).toBeInTheDocument();
    });
  });

  it('shows Post to Slack button after generating recap', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ recap_text: 'Event 5 was fire. Matt went -5 under...' }),
    });

    render(<RecapPage />);

    await waitFor(() => {
      expect(screen.getByText('Generate Recap')).toBeInTheDocument();
    });

    const generateBtn = screen.getByText('Generate Recap');
    await userEvent.click(generateBtn);

    await waitFor(() => {
      expect(screen.getByText('Post to Slack')).toBeInTheDocument();
    });
  });
});
