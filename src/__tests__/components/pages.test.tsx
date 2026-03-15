import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock all hooks used by pages
const mockUseUser = vi.fn().mockReturnValue({
  profile: null,
  authUser: null,
  loading: false,
  isAdmin: false,
  isMember: false,
  isPlayingGuest: false,
  isAuthenticated: false,
});

const mockUseSeason = vi.fn().mockReturnValue({
  season: null,
  currentEvent: null,
  loading: false,
  isOffSeason: false,
  isRegularSeason: true,
  isPlayoffs: false,
  isTournament: false,
  canSubmitScores: true,
});

const mockUseNotifications = vi.fn().mockReturnValue({
  notifications: [],
  unreadCount: 0,
  loading: false,
  markAsRead: vi.fn(),
  markAllAsRead: vi.fn(),
  deleteNotification: vi.fn(),
  refresh: vi.fn(),
});

vi.mock('@/lib/hooks/useUser', () => ({
  useUser: () => mockUseUser(),
}));

vi.mock('@/lib/hooks/useSeason', () => ({
  useSeason: () => mockUseSeason(),
}));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => mockUseNotifications(),
}));

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ showToast: vi.fn() }),
  ToastProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock('@/components/navigation/NotificationBell', () => ({
  default: () => <div data-testid="notification-bell" />,
}));

// Import pages after mocks
import EventHistoryPage from '@/app/(protected)/event-history/page';
import MembersPage from '@/app/(protected)/members/page';
import SchedulePage from '@/app/(protected)/schedule/page';
import StatsPage from '@/app/(protected)/stats/page';
import PlayoffsPage from '@/app/(protected)/playoffs/page';
import TournamentPage from '@/app/(protected)/tournament/page';
import NotificationsPage from '@/app/(protected)/notifications/page';
import BridgeScoresPage from '@/app/(protected)/scores/bridge/page';

describe('Page rendering', () => {
  describe('EventHistoryPage', () => {
    it('renders the heading', () => {
      render(<EventHistoryPage />);
      expect(screen.getByText('Event History')).toBeInTheDocument();
    });
  });

  describe('MembersPage', () => {
    it('renders the heading and search', () => {
      render(<MembersPage />);
      expect(screen.getByText('Members')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('Search members...')).toBeInTheDocument();
    });

    it('shows 0 members count', () => {
      render(<MembersPage />);
      expect(screen.getByText('0 members')).toBeInTheDocument();
    });
  });

  describe('SchedulePage', () => {
    it('renders the heading', () => {
      render(<SchedulePage />);
      expect(screen.getByText('Schedule')).toBeInTheDocument();
    });
  });

  describe('StatsPage', () => {
    it('renders loading state initially (profile is null)', () => {
      const { container } = render(<StatsPage />);
      // With null profile, stats page shows loading skeleton
      expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
    });
  });

  describe('PlayoffsPage', () => {
    it('renders the heading', () => {
      render(<PlayoffsPage />);
      expect(screen.getByText('Playoffs')).toBeInTheDocument();
    });

    it('hides flight tabs when no bracket data exists', () => {
      render(<PlayoffsPage />);
      expect(screen.queryByText('Championship')).not.toBeInTheDocument();
      expect(screen.queryByText('Consolation')).not.toBeInTheDocument();
      expect(screen.queryByText('Unicorn')).not.toBeInTheDocument();
    });
  });

  describe('TournamentPage', () => {
    it('renders when loading', () => {
      render(<TournamentPage />);
      // Should render without crashing -- it starts in loading state
    });
  });

  describe('NotificationsPage', () => {
    it('renders heading', () => {
      render(<NotificationsPage />);
      expect(screen.getByText('Notifications')).toBeInTheDocument();
    });

    it('shows empty state', () => {
      render(<NotificationsPage />);
      expect(screen.getByText('No notifications yet.')).toBeInTheDocument();
    });
  });

  describe('BridgeScoresPage', () => {
    it('renders heading', () => {
      render(<BridgeScoresPage />);
      expect(screen.getByText('Bridge 9-Hole Scores')).toBeInTheDocument();
    });

    it('shows info banner', () => {
      render(<BridgeScoresPage />);
      expect(screen.getByText(/Select two 9-hole rounds/)).toBeInTheDocument();
    });
  });
});

describe('Off-season enforcement', () => {
  it('leaderboard page renders loading state by default', async () => {
    // The leaderboard page starts with loading=true and fetches data.
    // With mocked supabase returning no data, it stays in loading state.
    const { default: LeaderboardPage } = await import('@/app/(protected)/leaderboard/page');
    const { container } = render(<LeaderboardPage />);
    // Should render loading skeleton (animate-pulse divs)
    expect(container.querySelector('.animate-pulse')).toBeInTheDocument();
  });
});
