import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const mockPush = vi.fn();
const mockBack = vi.fn();

let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useSearchParams: () => mockSearchParams,
}));

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: { id: 'user-1', full_name: 'Test User', email: 'test@test.com', role: 'member', handicap_index: 15.0 },
    isAdmin: false,
    isPlayingGuest: false,
    loading: false,
  }),
}));

let mockCurrentEvent: { id: string; holes: number; name: string; event_number: number; is_major: boolean; is_playoff: boolean } | null = null;
let mockSeasonLoading = false;
vi.mock('@/lib/hooks/useSeason', () => ({
  useSeason: () => ({
    currentEvent: mockCurrentEvent,
    isOffSeason: false,
    isRegularSeason: true,
    canSubmitScores: true,
    loading: mockSeasonLoading,
  }),
}));

const mockShowToast = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }));
vi.mock('@/lib/slack-notify', () => ({ notifySlack: vi.fn() }));
vi.mock('swr', () => ({ useSWRConfig: () => ({ mutate: vi.fn() }) }));

const mockCourses = [
  { id: 'c1', course_name: 'Tree Farm', tee_name: 'Middle', type: 'front_9', par: 35, rating: 35.2, slope: 128 },
  { id: 'c2', course_name: 'Tree Farm', tee_name: 'Middle', type: '18_holes', par: 71, rating: 71.3, slope: 132 },
  { id: 'c3', course_name: 'Pine Valley', tee_name: 'Blue', type: '18_holes', par: 72, rating: 74.5, slope: 135 },
];

const mockMembers = [
  { id: 'user-1', full_name: 'Test User', email: 'test@test.com', role: 'member', handicap_index: 15.0 },
  { id: 'user-2', full_name: 'Hastings Westphal', email: 'hastings@test.com', role: 'member', handicap_index: 12.1 },
];

import { mockSupabaseClient } from '../setup';

function setupMockFrom() {
  const chainMethods = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    neq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    is: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    range: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    then: vi.fn(),
  };

  mockSupabaseClient.from.mockImplementation((table: string) => {
    const chain = { ...chainMethods };

    if (table === 'courses') {
      // fetchAllCourses calls .from('courses').select('*').order('course_name').range(0, 999)
      let rangeCallCount = 0;
      chain.range = vi.fn().mockImplementation(() => {
        rangeCallCount++;
        // First call returns courses, subsequent calls return empty (end of pagination)
        if (rangeCallCount === 1) {
          return Promise.resolve({ data: mockCourses, error: null });
        }
        return Promise.resolve({ data: [], error: null });
      });
      chain.order = vi.fn().mockReturnValue(chain);
    } else if (table === 'users') {
      chain.in = vi.fn().mockReturnValue({
        ...chain,
        order: vi.fn().mockResolvedValue({ data: mockMembers, error: null }),
      });
    }

    chain.select = vi.fn().mockReturnValue(chain);
    return chain;
  });
}

import AddScorePage from '@/app/(protected)/scores/add/page';

describe('AddScorePage - Course Filtering', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockSeasonLoading = false;
    mockCurrentEvent = { id: 'event-1', holes: 18, name: 'Event 5', event_number: 5, is_major: false, is_playoff: false };
    setupMockFrom();
  });

  it('filters out 9-hole courses for 18-hole events', async () => {
    render(<AddScorePage />);

    await waitFor(() => {
      expect(screen.getByText(/Pine Valley/)).toBeInTheDocument();
    });

    const courseButtons = screen.getAllByRole('button').filter(
      btn => btn.textContent?.includes('Pine Valley') || btn.textContent?.includes('Tree Farm')
    );

    const treeNames = courseButtons.filter(btn => btn.textContent?.includes('Tree Farm'));
    expect(treeNames.length).toBe(1);
    expect(treeNames[0].textContent).toContain('18 holes');
  });

  it('shows helpful message when search matches no courses due to filtering', async () => {
    render(<AddScorePage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search courses...')).toBeInTheDocument();
    });

    const searchInput = screen.getByPlaceholderText('Search courses...');
    fireEvent.change(searchInput, { target: { value: 'Nonexistent' } });

    await waitFor(() => {
      expect(screen.getByText(/No matching courses found/)).toBeInTheDocument();
      expect(screen.getByText(/Only 18-hole courses are shown/)).toBeInTheDocument();
    });
  });

  it('shows event hole-count filter banner', async () => {
    render(<AddScorePage />);

    await waitFor(() => {
      expect(screen.getByText(/Showing 18-hole courses for the current 18-hole event/)).toBeInTheDocument();
    });
  });

  it('does not show loading skeleton when no preselected course', async () => {
    render(<AddScorePage />);

    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBe(0);
  });
});

describe('AddScorePage - Preselected Course Race Condition', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSeasonLoading = false;
    mockCurrentEvent = null;
    setupMockFrom();
  });

  it('shows loading skeleton while season is still loading', () => {
    mockSeasonLoading = true;
    mockSearchParams = new URLSearchParams('course_id=c1');
    render(<AddScorePage />);

    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it('redirects to course step when preselected course does not match event holes', async () => {
    mockCurrentEvent = { id: 'event-1', holes: 18, name: 'Event 5', event_number: 5, is_major: false, is_playoff: false };
    mockSearchParams = new URLSearchParams('course_id=c1');

    render(<AddScorePage />);

    await waitFor(() => {
      expect(screen.getByText(/Step 1 of 3/)).toBeInTheDocument();
      expect(screen.getByText(/Select course/)).toBeInTheDocument();
    });
  });

  it('advances to player step when preselected course matches event holes', async () => {
    mockCurrentEvent = { id: 'event-1', holes: 18, name: 'Event 5', event_number: 5, is_major: false, is_playoff: false };
    mockSearchParams = new URLSearchParams('course_id=c2');

    render(<AddScorePage />);

    await waitFor(() => {
      expect(screen.getByText(/Step 2 of 3/)).toBeInTheDocument();
      expect(screen.getByText(/Select player/)).toBeInTheDocument();
    });
  });

  it('waits for season data before resolving preselected course', async () => {
    mockSeasonLoading = true;
    mockSearchParams = new URLSearchParams('course_id=c1');

    const { rerender } = render(<AddScorePage />);

    // Should show loading skeleton, not step 1 or step 2
    const skeletons = document.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThan(0);
    expect(screen.queryByText(/Step 2 of 3/)).not.toBeInTheDocument();
  });
});

describe('AddScorePage - Submit Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
    mockSeasonLoading = false;
    mockCurrentEvent = { id: 'event-1', holes: 18, name: 'Event 5', event_number: 5, is_major: false, is_playoff: false };
    setupMockFrom();
  });

  it('shows course selection when no course is preselected', async () => {
    render(<AddScorePage />);

    await waitFor(() => {
      expect(screen.getByPlaceholderText('Search courses...')).toBeInTheDocument();
      expect(screen.getByText(/Step 1 of 3/)).toBeInTheDocument();
    });
  });
});
