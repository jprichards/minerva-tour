import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import QuickScore from '@/components/QuickScore';
import type { Score } from '@/types/database';

const mockScheduleUpdate = vi.fn();
vi.mock('@/lib/hooks/useQuickScoreSave', () => ({
  useQuickScoreSave: () => ({
    scheduleUpdate: mockScheduleUpdate,
    flush: vi.fn(),
  }),
}));

function makeScore(overrides: Partial<Score> = {}): Score {
  return {
    id: 'score-1',
    user_id: 'user-1',
    event_id: 'event-1',
    course_id: 'course-1',
    tee_time: '2026-03-06T10:00:00',
    gross_score: null,
    holes_played: null,
    is_complete: false,
    course_handicap: null,
    net_score: null,
    net_strokes_over_par: null,
    points_awarded: null,
    handicap_index_used: null,
    combined_with_score_id: null,
    is_retroactive: false,
    submitted_by: null,
    created_at: '2026-03-06T10:00:00',
    updated_at: '2026-03-06T10:00:00',
    course: {
      id: 'course-1',
      course_name: 'Pine Valley',
      tee_name: 'White',
      type: '18_holes',
      rating: 72.1,
      slope: 130,
      par: 72,
      created_by: null,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
      updated_by: null,
    },
    user: {
      id: 'user-1',
      full_name: 'John Smith',
      email: 'john@test.com',
      role: 'member',
      handicap_index: 15.0,
      ghin_number: null,
      profile_picture_url: null,
      is_commissioner: false,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    } as Score['user'],
    event: {
      id: 'event-1',
      season_id: 'season-1',
      event_number: 1,
      name: 'Event 1',
      start_date: '2026-03-06',
      end_date: '2026-03-08',
      holes: 18,
      is_major: false,
      is_playoff: false,
      created_at: '2026-01-01',
      updated_at: '2026-01-01',
    },
    ...overrides,
  } as unknown as Score;
}

describe('QuickScore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders score-to-par and hole sections', () => {
    render(<QuickScore score={makeScore()} onSaved={vi.fn()} />);

    expect(screen.getByText('Gross Score to Par')).toBeInTheDocument();
    expect(screen.getByText('E')).toBeInTheDocument();
    expect(screen.getByText('Hole')).toBeInTheDocument();
  });

  it('shows initial state as "Not Started" when no score exists', () => {
    render(<QuickScore score={makeScore()} onSaved={vi.fn()} />);
    expect(screen.getByText('E')).toBeInTheDocument();
    expect(screen.getByText('Not Started')).toBeInTheDocument();
  });

  it('increments score-to-par on + tap', () => {
    render(<QuickScore score={makeScore()} onSaved={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    const plusButton = buttons[1]; // second button is +
    fireEvent.click(plusButton);

    expect(screen.getByText('+1')).toBeInTheDocument();
    expect(mockScheduleUpdate).toHaveBeenCalledWith({ grossToPar: 1, holesPlayed: 0 });
  });

  it('decrements score-to-par on - tap', () => {
    render(<QuickScore score={makeScore()} onSaved={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    const minusButton = buttons[0]; // first button is -
    fireEvent.click(minusButton);

    expect(screen.getByText('-1')).toBeInTheDocument();
    expect(mockScheduleUpdate).toHaveBeenCalledWith({ grossToPar: -1, holesPlayed: 0 });
  });

  it('increments hole thru on right arrow tap', () => {
    const score = makeScore({ holes_played: 5, gross_score: 25 });
    render(<QuickScore score={score} onSaved={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    const rightArrow = buttons[3]; // 4th button is right arrow
    fireEvent.click(rightArrow);

    expect(mockScheduleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ holesPlayed: 6 })
    );
  });

  it('decrements hole thru on left arrow tap', () => {
    const score = makeScore({ holes_played: 5, gross_score: 25 });
    render(<QuickScore score={score} onSaved={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    const leftArrow = buttons[2]; // 3rd button is left arrow
    fireEvent.click(leftArrow);

    expect(mockScheduleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ holesPlayed: 4 })
    );
  });

  it('can decrement hole from 1 back to 0 (Not Started)', () => {
    const score = makeScore({ holes_played: 1, gross_score: 5 });
    render(<QuickScore score={score} onSaved={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    const leftArrow = buttons[2];
    expect(leftArrow).not.toBeDisabled();
    fireEvent.click(leftArrow);

    expect(screen.getByText('Not Started')).toBeInTheDocument();
    expect(mockScheduleUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ holesPlayed: 0 })
    );
  });

  it('disables left arrow when hole is 0 (Not Started)', () => {
    render(<QuickScore score={makeScore()} onSaved={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    const leftArrow = buttons[2];
    expect(leftArrow).toBeDisabled();
  });

  it('disables right arrow when hole is max', () => {
    const score = makeScore({ holes_played: 18, gross_score: 82 });
    render(<QuickScore score={score} onSaved={vi.fn()} />);

    const buttons = screen.getAllByRole('button');
    const rightArrow = buttons[3];
    expect(rightArrow).toBeDisabled();
  });

  it('shows "Thru F" when at max holes', () => {
    const score = makeScore({ holes_played: 18, gross_score: 82 });
    render(<QuickScore score={score} onSaved={vi.fn()} />);

    expect(screen.getByText('Thru F')).toBeInTheDocument();
  });

  it('displays summary line with "Not Started" when no holes played', () => {
    render(<QuickScore score={makeScore()} onSaved={vi.fn()} />);

    expect(screen.getByText(/Score to Par: E · Not Started/)).toBeInTheDocument();
  });

  it('displays summary with gross score when holes > 0', () => {
    const score = makeScore({ holes_played: 9, gross_score: 45 });
    render(<QuickScore score={score} onSaved={vi.fn()} />);

    expect(screen.getByText(/45/)).toBeInTheDocument();
    expect(screen.getByText(/Thru 9 of 18/)).toBeInTheDocument();
  });

  it('shows net score in summary when player has handicap and holes > 0', () => {
    const score = makeScore({ holes_played: 9, gross_score: 45 });
    render(<QuickScore score={score} onSaved={vi.fn()} />);

    expect(screen.getByText(/Net/)).toBeInTheDocument();
  });

  it('initializes from existing score data', () => {
    // 82 on 18 holes, par 72 → gross to par = +10
    const score = makeScore({ gross_score: 82, holes_played: 18 });
    render(<QuickScore score={score} onSaved={vi.fn()} />);

    expect(screen.getByText('+10')).toBeInTheDocument();
    expect(screen.getByText('Thru F')).toBeInTheDocument();
  });

  it('initializes from partial round data', () => {
    // 45 on 9 holes, par 72, partial par = 36 → gross to par = +9
    const score = makeScore({ gross_score: 45, holes_played: 9 });
    render(<QuickScore score={score} onSaved={vi.fn()} />);

    expect(screen.getByText('+9')).toBeInTheDocument();
  });

  it('shows helper text for both sections', () => {
    render(<QuickScore score={makeScore()} onSaved={vi.fn()} />);

    expect(screen.getByText(/increment or decrement.*Gross Score to Par/i)).toBeInTheDocument();
    expect(screen.getByText(/increment or decrement Thru/i)).toBeInTheDocument();
  });

  it('returns null when no course is present', () => {
    const score = makeScore();
    (score as unknown as Record<string, unknown>).course = undefined;
    const { container } = render(<QuickScore score={score} onSaved={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });
});
