import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

const mockPush = vi.fn();
const mockBack = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: mockBack }),
  useParams: () => ({ id: 'course-1' }),
}));

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: { id: 'user-1', full_name: 'Test User', email: 'test@test.com', role: 'admin' },
    isAdmin: true,
    loading: false,
  }),
}));

let mockCurrentEvent: { id: string; holes: number } | null = null;
vi.mock('@/lib/hooks/useSeason', () => ({
  useSeason: () => ({ currentEvent: mockCurrentEvent }),
}));

const mockShowToast = vi.fn();
vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: mockShowToast }),
}));

vi.mock('@/lib/audit', () => ({ logAuditEvent: vi.fn() }));

import { mockSupabaseClient } from '../setup';

function setupMockCourse(courseData: Record<string, unknown>) {
  const courseChain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue({ data: courseData, error: null }),
    }),
    delete: vi.fn().mockReturnThis(),
  };

  mockSupabaseClient.from.mockImplementation((table: string) => {
    if (table === 'courses') return courseChain;
    if (table === 'users') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { full_name: 'Creator User', email: 'creator@test.com' },
              error: null,
            }),
          }),
        }),
      };
    }
    return courseChain;
  });
}

import CourseDetailPage from '@/app/(protected)/courses/[id]/page';

describe('CourseDetailPage - Event Compatibility', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows warning when course type does not match current event holes', async () => {
    mockCurrentEvent = { id: 'event-1', holes: 18 };
    setupMockCourse({
      id: 'course-1',
      course_name: 'Tree Farm',
      tee_name: 'Middle',
      type: 'front_9',
      par: 35,
      rating: 35.2,
      slope: 128,
      created_by: 'user-1',
      updated_by: 'user-1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    render(<CourseDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Not compatible with current event')).toBeInTheDocument();
    });

    expect(screen.getByText(/this tee is configured as front 9/i)).toBeInTheDocument();
  });

  it('does not show warning when course type matches current event', async () => {
    mockCurrentEvent = { id: 'event-1', holes: 18 };
    setupMockCourse({
      id: 'course-1',
      course_name: 'Tree Farm',
      tee_name: 'Middle',
      type: '18_holes',
      par: 71,
      rating: 71.3,
      slope: 132,
      created_by: 'user-1',
      updated_by: 'user-1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    render(<CourseDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Tree Farm')).toBeInTheDocument();
    });

    expect(screen.queryByText('Not compatible with current event')).not.toBeInTheDocument();
  });

  it('disables Start a Round button for incompatible course', async () => {
    mockCurrentEvent = { id: 'event-1', holes: 18 };
    setupMockCourse({
      id: 'course-1',
      course_name: 'Tree Farm',
      tee_name: 'Middle',
      type: 'front_9',
      par: 35,
      rating: 35.2,
      slope: 128,
      created_by: 'user-1',
      updated_by: 'user-1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    render(<CourseDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Start a Round')).toBeInTheDocument();
    });

    const startRoundLink = screen.getByText('Start a Round').closest('a');
    expect(startRoundLink).toHaveClass('cursor-not-allowed');
  });

  it('does not show warning when no current event', async () => {
    mockCurrentEvent = null;
    setupMockCourse({
      id: 'course-1',
      course_name: 'Tree Farm',
      tee_name: 'Middle',
      type: 'front_9',
      par: 35,
      rating: 35.2,
      slope: 128,
      created_by: 'user-1',
      updated_by: 'user-1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    render(<CourseDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Tree Farm')).toBeInTheDocument();
    });

    expect(screen.queryByText('Not compatible with current event')).not.toBeInTheDocument();
  });

  it('prevents navigation when clicking disabled Start a Round', async () => {
    mockCurrentEvent = { id: 'event-1', holes: 18 };
    setupMockCourse({
      id: 'course-1',
      course_name: 'Tree Farm',
      tee_name: 'Middle',
      type: 'back_9',
      par: 36,
      rating: 36.1,
      slope: 136,
      created_by: 'user-1',
      updated_by: 'user-1',
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    });

    render(<CourseDetailPage />);

    await waitFor(() => {
      expect(screen.getByText('Start a Round')).toBeInTheDocument();
    });

    const startRoundLink = screen.getByText('Start a Round').closest('a')!;
    const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(clickEvent, 'preventDefault');

    startRoundLink.dispatchEvent(clickEvent);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });
});
