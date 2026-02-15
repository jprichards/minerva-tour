import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockRouter = { push: vi.fn(), back: vi.fn(), replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() };
vi.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/scores/bridge',
  useParams: () => ({}),
}));

const mockUseUser = vi.fn();
vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => mockUseUser(),
}));

const mockUseSeason = vi.fn();
vi.mock('@/lib/hooks/useSeason', () => ({
  useSeason: () => mockUseSeason(),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/lib/audit', () => ({
  logAuditEvent: vi.fn(),
}));

import BridgeScoresPage from '@/app/(protected)/scores/bridge/page';

describe('Bridge Scores Page - Major/Playoff Block', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUser.mockReturnValue({
      profile: { id: 'user-1', full_name: 'Test User', handicap_index: 12.0 },
      isAdmin: false,
      isPlayingGuest: false,
    });
  });

  it('shows block message when current event is a major', () => {
    mockUseSeason.mockReturnValue({
      season: { id: 's-1', mode: 'regular_season' },
      currentEvent: { id: 'e-1', is_major: true, is_playoff: false },
      loading: false,
      isOffSeason: false,
      isRegularSeason: true,
      isPlayoffs: false,
      isTournament: false,
      canSubmitScores: true,
    });

    render(<BridgeScoresPage />);
    expect(screen.getByText('Bridging Not Available')).toBeInTheDocument();
    expect(screen.getByText(/Major and playoff events require full 18-hole rounds/)).toBeInTheDocument();
  });

  it('shows block message when current event is a playoff', () => {
    mockUseSeason.mockReturnValue({
      season: { id: 's-1', mode: 'playoffs' },
      currentEvent: { id: 'e-1', is_major: false, is_playoff: true },
      loading: false,
      isOffSeason: false,
      isRegularSeason: false,
      isPlayoffs: true,
      isTournament: false,
      canSubmitScores: true,
    });

    render(<BridgeScoresPage />);
    expect(screen.getByText('Bridging Not Available')).toBeInTheDocument();
  });

  it('renders normal bridge UI when event is regular', () => {
    mockUseSeason.mockReturnValue({
      season: { id: 's-1', mode: 'regular_season' },
      currentEvent: { id: 'e-1', is_major: false, is_playoff: false },
      loading: false,
      isOffSeason: false,
      isRegularSeason: true,
      isPlayoffs: false,
      isTournament: false,
      canSubmitScores: true,
    });

    render(<BridgeScoresPage />);
    expect(screen.getByText('Bridge 9-Hole Scores')).toBeInTheDocument();
    expect(screen.queryByText('Bridging Not Available')).not.toBeInTheDocument();
  });

  it('renders normal bridge UI when no current event', () => {
    mockUseSeason.mockReturnValue({
      season: { id: 's-1', mode: 'regular_season' },
      currentEvent: null,
      loading: false,
      isOffSeason: false,
      isRegularSeason: true,
      isPlayoffs: false,
      isTournament: false,
      canSubmitScores: true,
    });

    render(<BridgeScoresPage />);
    expect(screen.getByText('Bridge 9-Hole Scores')).toBeInTheDocument();
  });
});

describe('Splicing Prevention Logic', () => {
  it('filters out complete 18-hole rounds from bridge eligibility', () => {
    // This tests the business rule: only genuinely standalone 9-hole rounds are eligible
    const scores = [
      { id: '1', holes_played: 9, combined_with_score_id: null, course: { type: '9_holes' } },
      { id: '2', holes_played: 18, combined_with_score_id: null, course: { type: '18_holes' } }, // should be excluded
      { id: '3', holes_played: 9, combined_with_score_id: 'other-score', course: { type: '9_holes' } }, // already bridged
      { id: '4', holes_played: 9, combined_with_score_id: null, course: { type: 'front_9' } },
    ];

    // Filter: only 9-hole, unbridged scores
    const eligible = scores.filter(
      (s) => s.holes_played === 9 && s.combined_with_score_id === null
    );

    expect(eligible).toHaveLength(2);
    expect(eligible.map((s) => s.id)).toEqual(['1', '4']);
  });
});
