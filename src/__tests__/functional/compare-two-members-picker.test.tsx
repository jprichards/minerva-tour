import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, back: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/stats',
  useParams: () => ({}),
}));

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => ({
    profile: { id: 'user-1', full_name: 'Jason Richards', email: 'jason@test.com', handicap_index: 15.0 },
    authUser: { id: 'user-1' },
    loading: false,
    isAdmin: false,
    isMember: true,
    isPlayingGuest: false,
    isAuthenticated: true,
  }),
}));

vi.mock('@/lib/hooks/useSeason', () => ({
  useSeason: () => ({
    season: { id: 's-1', mode: 'regular_season' },
    currentEvent: null,
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

const mockMembers = [
  { id: 'user-1', full_name: 'Jason Richards', email: 'jason@test.com', role: 'member', profile_picture_url: null },
  { id: 'user-2', full_name: 'Tiger Woods', email: 'tiger@test.com', role: 'member', profile_picture_url: 'https://example.com/tiger.jpg' },
  { id: 'user-3', full_name: 'Rory McIlroy', email: 'rory@test.com', role: 'member', profile_picture_url: null },
];

const mockScores = [
  {
    id: 's1', user_id: 'user-1', gross_score: 85, net_score: 72, net_strokes_over_par: 0,
    holes_played: 18, is_complete: true, tee_time: '2025-05-10T14:00:00Z', created_at: '2025-05-10T00:00:00Z',
    event_id: 'evt-1',
  },
];

vi.mock('swr', () => ({
  default: () => ({
    data: { myScores: mockScores, allMembers: mockMembers },
    isLoading: false,
    error: null,
    mutate: vi.fn(),
  }),
}));

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

import StatsPage from '@/app/(protected)/stats/page';

describe('Stats Page - Compare Any Two Members Picker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the "Compare Any Two Members" section', () => {
    render(<StatsPage />);
    expect(screen.getByText('Compare Any Two Members')).toBeInTheDocument();
  });

  it('renders two member dropdowns', () => {
    render(<StatsPage />);
    const selects = screen.getAllByRole('combobox');
    // At least 2 for the two-member picker (may also have year/event selectors)
    const memberSelects = selects.filter(s => {
      const options = Array.from(s.querySelectorAll('option'));
      return options.some(o => o.textContent === 'Tiger Woods');
    });
    expect(memberSelects).toHaveLength(2);
  });

  it('has a disabled Compare button when no members are selected', () => {
    render(<StatsPage />);
    const compareBtn = screen.getByRole('button', { name: 'Compare' });
    expect(compareBtn).toBeDisabled();
  });

  it('enables the Compare button when two different members are selected', () => {
    render(<StatsPage />);
    const selects = screen.getAllByRole('combobox').filter(s => {
      const options = Array.from(s.querySelectorAll('option'));
      return options.some(o => o.textContent === 'Tiger Woods');
    });

    fireEvent.change(selects[0], { target: { value: 'user-2' } });
    fireEvent.change(selects[1], { target: { value: 'user-3' } });

    const compareBtn = screen.getByRole('button', { name: 'Compare' });
    expect(compareBtn).not.toBeDisabled();
  });

  it('navigates to the correct H2H URL with ?vs= param when Compare is clicked', () => {
    render(<StatsPage />);
    const selects = screen.getAllByRole('combobox').filter(s => {
      const options = Array.from(s.querySelectorAll('option'));
      return options.some(o => o.textContent === 'Tiger Woods');
    });

    fireEvent.change(selects[0], { target: { value: 'user-2' } });
    fireEvent.change(selects[1], { target: { value: 'user-3' } });

    const compareBtn = screen.getByRole('button', { name: 'Compare' });
    fireEvent.click(compareBtn);

    expect(mockPush).toHaveBeenCalledWith('/stats/user-3?vs=user-2');
  });

  it('does not navigate when same member is selected for both', () => {
    render(<StatsPage />);
    const selects = screen.getAllByRole('combobox').filter(s => {
      const options = Array.from(s.querySelectorAll('option'));
      return options.some(o => o.textContent === 'Tiger Woods');
    });

    fireEvent.change(selects[0], { target: { value: 'user-2' } });
    fireEvent.change(selects[1], { target: { value: 'user-2' } });

    const compareBtn = screen.getByRole('button', { name: 'Compare' });
    expect(compareBtn).toBeDisabled();
  });
});
